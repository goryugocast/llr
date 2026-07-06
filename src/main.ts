import { Editor, EditorPosition, MarkdownView, Notice, Platform, Plugin, TFile, WorkspaceLeaf, moment } from 'obsidian';
import { calculateDuration, findLatestCompletionEndTime } from './service/time-calculator';
import { CheckboxPressIntent, adjustTaskTimeByMinutes, formatTime, prepareCursorBeforeActualStart, getCursorAfterActualEndCh, normalizeCompletedTaskActualDuration, transformCheckboxPress, transformTaskLine } from './service/task-transformer';
import { RoutineEngine, type RoutineCompletionRequest, type RoutineEngineDebugEvent, type RoutineNote } from './service/routine-engine';
import { computeStatusBarMetrics } from './service/status-bar-calculator';
import { parseRepeatExpression, parseScheduleExpression } from './service/yaml-parser';
import { parseRoutineRescheduleMarker, replaceRoutineRescheduleMarker } from './service/routine-reschedule-marker';
import { hasPendingRoutineAtDoneMarker, replacePendingRoutineAtDoneMarker } from './service/routine-atdone-marker';
import { SummaryView, SummaryViewDelegate, VIEW_TYPE_SUMMARY } from './view/summary-view';
import { CheckboxInteractionController } from './view/checkbox-interaction-controller';
import { getCM6View } from './view/editor-internal';
import { isDailyNoteMatch, resolveDailyNoteDate, resolveDailyNoteFolder, resolveMutationReferenceDate, resolveReferenceDate, type DailyNoteSettings as DailyNoteSettingsSpec } from './service/daily-note-context';
import { DebugLog } from './service/debug-log';
import { RoutineCompletionSnapshotStore, buildRoutineCompletionSignature } from './service/routine-completion-snapshot';
import { DailyNoteAutoInsertController } from './service/daily-note-auto-insert';
import { TaskParser } from './service/task-parser';
import { TranslationKey, UILanguage, resolveLanguage, translate } from './i18n';
import { DEFAULT_SETTINGS, LlrSettings, SectionDefinition, normalizeDailyNoteFolder, normalizeRoutineFolder, normalizeSectionDefinitions, parseSectionTimeToInt } from './service/settings';
import { LlrSettingTab } from './view/settings-tab';
import { SRS_BATCH_END, isSrsBatchAllComplete, collectLinkedBasenames, sortSrsCandidatesByOverdue, formatSrsTaskLine, buildSrsBatchBlock } from './service/srs-batch';

interface LlrPostActionContext {
    editor: Editor;
    view: MarkdownView;
    file: TFile;
    reason: string;
    skipAtDoneLineIndexes?: Set<number>;
    processedAtDoneCompletions?: Map<string, Set<string>>;
}

interface LlrPostActionPassResult {
    kind: 'duration-drift' | 'routine-reschedule-marker' | 'routine-atdone-marker';
    changedCount: number;
}

interface ApplyTaskResultOptions {
    placeCursorBeforeActualStart?: boolean;
}


const LEGACY_SKIP_COMMAND_ID = 'defer-task-to-tomorrow';
const SKIP_COMMAND_ID = 'skip-task-log-only';

export default class LlrPlugin extends Plugin {
    private routineEngine: RoutineEngine;
    private settings: LlrSettings = DEFAULT_SETTINGS;
    private statusBar: HTMLElement;
    private statusBarDebounce: ReturnType<typeof setTimeout> | null = null;
    // Checkbox tap/long-press gesture handling is delegated to CheckboxInteractionController.
    private checkbox!: CheckboxInteractionController;
    private scheduleValidationTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private lastScheduleValidationError: Map<string, string> = new Map();
    private metadataChangedTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private snapshots!: RoutineCompletionSnapshotStore;
    private dailyAutoInsert!: DailyNoteAutoInsertController;
    private refreshTimer: ReturnType<typeof setInterval> | null = null;
    private lastDebugNoticeAtMs = 0;
    private readonly debugNoticeThrottleMs = 5000;
    // Debug log I/O is delegated to DebugLog. Logs live outside the routine folder
    // (llrlog/) so Base views on routines don't react to debug writes.
    private debug!: DebugLog;

    async onload() {
        this.debug = new DebugLog(
            this.app,
            () => this.settings.debugModeEnabled,
            (message, timeout) => this.showLlrNotice(message, timeout),
        );
        this.checkbox = new CheckboxInteractionController(this.app, {
            isOverrideEnabled: () => this.settings.checkboxOverrideEnabled,
            isEditableMarkdownView: () => this.isEditableMarkdownView(),
            getLineStateLabel: (lineIndex) => this.getTaskLineState(this.getLineTextAt(lineIndex)),
            onCheckboxPress: (intent, lineIndex) => this.handleCheckboxPress(intent, lineIndex),
            debugLog: (message, data) => this.debugLog(message, data),
            updateUI: () => this.updateUI(),
        });
        await this.loadSettings();
        this.syncMobileLargeCheckboxClass();
        this.addSettingTab(new LlrSettingTab(this.app, this));

        this.routineEngine = new RoutineEngine(this.app, {
            routineFolder: this.settings.routineFolder,
            srsGrowthEnabled: this.settings.srsGrowthEnabled,
            onDebugEvent: (event) => this.handleRoutineEngineDebugEvent(event),
            onNotice: (message, timeout) => this.showLlrNotice(message, timeout),
        });
        this.snapshots = new RoutineCompletionSnapshotStore(this.app, {
            isDailyNoteFile: (file) => this.isDailyNoteFile(file),
            resolveRoutineFile: (link, sourcePath) => this.routineEngine.resolveRoutineFile(link, sourcePath),
        });
        this.dailyAutoInsert = new DailyNoteAutoInsertController(this.app, {
            isDailyNoteFile: (file) => this.isDailyNoteFile(file),
            parseDailyNoteDate: (file) => this.parseDailyNoteDate(file),
            getDailyNoteSettings: () => this.getDailyNoteSettings(),
            buildRoutineInsertLines: (targetDate) => this.buildRoutineInsertLines(targetDate),
            debugLog: (message, data) => this.debugLog(message, data),
        });
        this.debugLog('Loading LLR plugin...');

        // Single status bar item for full control over spacing
        this.statusBar = this.addStatusBarItem();
        this.statusBar.setText('');

        const summaryDelegate: SummaryViewDelegate = {
            getRoutineFolder: () => this.settings.routineFolder,
            getSectionBoundaries: () => this.getSortedSectionBoundaries(),
            getDailyNoteSettings: () => this.getDailyNoteSettings(),
        };
        this.registerView(
            VIEW_TYPE_SUMMARY,
            (leaf) => new SummaryView(leaf, summaryDelegate)
        );

        this.addRibbonIcon('list-checks', this.t('ribbon.openSummary'), () => {
            void this.activateView();
        });
        this.addRibbonIcon('alarm-clock-minus', this.t('ribbon.adjustTime1m'), () => {
            void this.runCommandWithDebug('adjust-time-1m-ribbon', `${this.t('command.adjustTime1m')} [Ribbon]`, async () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!view) {
                    this.showLlrNotice('LLR: Markdownノートを開いてください。');
                    return;
                }
                if (!this.ensureDailyNoteView(view, 'Adjust Time')) return;
                await this.handleAdjustTime(view.editor, view, -1);
            });
        });

        // Update status bar when active leaf changes or editor changes
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => this.scheduleUIUpdate())
        );
        this.registerEvent(
            this.app.workspace.on('editor-change', () => this.scheduleUIUpdate())
        );
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile) {
                    this.scheduleRoutineScheduleValidation(file);
                }
            })
        );
        this.registerEvent(
            this.app.vault.on('create', (file) => {
                if (file instanceof TFile) {
                    this.dailyAutoInsert.schedule(file, 0, 'create');
                }
            })
        );
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (file instanceof TFile) {
                    this.dailyAutoInsert.schedule(file, 0, 'open');
                }
            })
        );
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => this.scheduleMetadataChangedProcessing(file))
        );
        this.app.workspace.onLayoutReady(() => {
            this.dailyAutoInsert.tryStartup();
        });
        // Checkbox override + long-press support
        this.registerDomEvent(document, 'pointerdown', (ev) => this.checkbox.onPointerDown(ev));
        this.registerDomEvent(document, 'pointerup', (ev) => this.checkbox.onPointerUp(ev));
        this.registerDomEvent(document, 'pointercancel', () => this.checkbox.onPointerCancel());
        // Cursor movement tracking (click or key navigation)
        this.registerDomEvent(document, 'click', (ev) => this.checkbox.onDocumentClick(ev), true);
        this.registerDomEvent(document, 'beforeinput', (ev) => { if (ev instanceof InputEvent) this.handleDocumentBeforeInput(ev); }, true);
        this.registerDomEvent(document, 'input', (ev) => { if (ev instanceof InputEvent) this.handleDocumentInput(ev); }, true);
        this.registerDomEvent(document, 'compositionstart', (ev) => { if (ev instanceof CompositionEvent) this.handleDocumentCompositionEvent('compositionstart', ev); }, true);
        this.registerDomEvent(document, 'compositionend', (ev) => { if (ev instanceof CompositionEvent) this.handleDocumentCompositionEvent('compositionend', ev); }, true);
        this.registerDomEvent(document, 'keyup', () => this.updateUI());
        // Initial update
        this.scheduleUIUpdate();

        // Refresh timer (every minute) to keep "end" and elapsed time updated
        this.refreshTimer = setInterval(() => {
            this.updateUI();
        }, 60000);

        this.addCommand({
            id: 'open-summary-view',
            name: this.t('command.openSummaryView'),
            icon: 'list-checks',
            callback: () => {
                void this.runCommandWithDebug('open-summary-view', this.t('command.openSummaryView'), async () => {
                    await this.activateView();
                });
            }
        });


        this.addCommand({
            id: 'toggle-task',
            name: this.t('command.toggleTask'),
            icon: 'step-forward',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                void this.runCommandWithDebug('toggle-task', this.t('command.toggleTask'), async () => {
                    this.debugLog('Command: Toggle Task');
                    await this.handleToggleTask(editor, view);
                });
            }
        });

        this.addCommand({
            id: 'adjust-time-1m',
            name: this.t('command.adjustTime1m'),
            icon: 'alarm-clock-minus',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                void this.runCommandWithDebug('adjust-time-1m', this.t('command.adjustTime1m'), async () => {
                    this.debugLog('Command: Adjust Time (1m)');
                    await this.handleAdjustTime(editor, view, -1);
                });
            }
        });

        this.addCommand({
            id: 'start-task',
            name: this.t('command.startTask'),
            icon: 'play',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                void this.runCommandWithDebug('start-task', this.t('command.startTask'), async () => {
                    this.debugLog('Command: Start Task');
                    await this.handleToggleTask(editor, view, 'start');
                });
            }
        });

        this.addCommand({
            id: 'stop-task',
            name: this.t('command.stopTask'),
            icon: 'circle-stop',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                void this.runCommandWithDebug('stop-task', this.t('command.stopTask'), async () => {
                    this.debugLog('Command: Stop Task');
                    await this.handleToggleTask(editor, view, 'complete');
                });
            }
        });

        this.addCommand({
            id: 'start-task-from-previous-completion',
            name: this.t('command.startTaskFromPrev'),
            icon: 'play-circle',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                void this.runCommandWithDebug('start-task-from-previous-completion', this.t('command.startTaskFromPrev'), async () => {
                    this.debugLog('Command: Start Task (Align to Previous Completion)');
                    await this.handleStartTaskFromPreviousCompletion(editor, view);
                });
            }
        });

        this.addCommand({
            id: 'duplicate-task',
            name: this.t('command.duplicateTask'),
            icon: 'copy',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                void this.runCommandWithDebug('duplicate-task', this.t('command.duplicateTask'), async () => {
                    this.debugLog('Command: Duplicate Task');
                    await this.handleToggleTask(editor, view, 'duplicate');
                });
            }
        });

        this.addCommand({
            id: SKIP_COMMAND_ID,
            name: this.t('command.skipTaskLogOnly'),
            icon: 'calendar-sync',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                void this.runCommandWithDebug(SKIP_COMMAND_ID, this.t('command.skipTaskLogOnly'), () => {
                    this.debugLog('Command: Skip Task (Log Only)');
                    void this.handleDeferTaskToTomorrow(editor, view);
                });
            }
        });

        this.addCommand({
            id: 'reschedule-routine',
            name: this.t('command.rescheduleRoutine'),
            icon: 'calendar-clock',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                void this.runCommandWithDebug('reschedule-routine', this.t('command.rescheduleRoutine'), async () => {
                    this.debugLog('Command: Reschedule Routine');
                    await this.handleRescheduleRoutine(editor, view);
                });
            }
        });

        this.addCommand({
            id: 'insert-routine',
            name: this.t('command.insertRoutine'),
            icon: 'calendar-plus',
            editorCallback: async (editor: Editor, view: MarkdownView) => {
                await this.runCommandWithDebug('insert-routine', this.t('command.insertRoutine'), async () => {
                    this.debugLog('Command: Insert Routine');
                    await this.handleInsertRoutine(editor, view);
                });
            }
        });

        this.migrateLegacySkipCommandHotkeys();
    }

    private migrateLegacySkipCommandHotkeys(): void {
        const hotkeyManager = (this.app as unknown as Record<string, unknown>)?.hotkeyManager;
        if (!hotkeyManager || typeof hotkeyManager !== 'object') return;
        const hm = hotkeyManager as Record<string, unknown>;
        if (typeof hm.setHotkeys !== 'function' || typeof hm.removeHotkeys !== 'function') return;

        const oldCommandId = `${this.manifest.id}:${LEGACY_SKIP_COMMAND_ID}`;
        const newCommandId = `${this.manifest.id}:${SKIP_COMMAND_ID}`;
        const customKeys = hm.customKeys as Record<string, unknown> | undefined;
        const oldKeys = customKeys?.[oldCommandId];
        const newKeys = customKeys?.[newCommandId];
        const oldHasKeys = Array.isArray(oldKeys) && oldKeys.length > 0;
        const newHasKeys = Array.isArray(newKeys) && newKeys.length > 0;

        if (oldHasKeys && !newHasKeys) {
            (hm.setHotkeys as (id: string, keys: unknown) => void)(newCommandId, oldKeys);
        }
        if (oldHasKeys || customKeys?.[oldCommandId] != null) {
            (hm.removeHotkeys as (id: string) => void)(oldCommandId);
        }
        if ((oldHasKeys || customKeys?.[oldCommandId] != null) && typeof hm.save === 'function') {
            (hm.save as () => void)();
            this.debugLog('Migrated legacy command hotkeys', {
                from: oldCommandId,
                to: newCommandId,
                migratedKeyCount: oldHasKeys ? oldKeys.length : 0,
            });
        }
    }

    private debugLog(message: string, data?: unknown) {
        const timestamp = new Date().toISOString();
        const logMsg = `[LLR Debug ${timestamp}] ${message}`;
        console.debug(logMsg);
        if (data) console.debug(data);
        this.debug.emit('plugin', message, data);
    }

    async loadSettings(): Promise<void> {
        const loaded: Record<string, unknown> | null = await this.loadData();
        const merged: LlrSettings = { ...DEFAULT_SETTINGS, ...(loaded ?? {}) };
        merged.checkboxOverrideEnabled = Boolean(loaded?.checkboxOverrideEnabled ?? merged.checkboxOverrideEnabled);
        merged.mobileLargeCheckboxEnabled = Boolean(loaded?.mobileLargeCheckboxEnabled ?? merged.mobileLargeCheckboxEnabled);
        merged.uiLanguage = (loaded?.uiLanguage === 'ja' || loaded?.uiLanguage === 'en')
            ? loaded.uiLanguage
            : 'auto';
        merged.routineFolder = normalizeRoutineFolder(loaded?.routineFolder ?? merged.routineFolder);
        merged.dailyNoteFolder = normalizeDailyNoteFolder(loaded?.dailyNoteFolder ?? merged.dailyNoteFolder);
        merged.sectionDefinitions = normalizeSectionDefinitions(loaded?.sectionDefinitions ?? merged.sectionDefinitions);
        merged.srsGrowthEnabled = Boolean(loaded?.srsGrowthEnabled ?? merged.srsGrowthEnabled);
        merged.srsMaxDaily = (typeof loaded?.srsMaxDaily === 'number' && Number.isInteger(loaded.srsMaxDaily) && loaded.srsMaxDaily >= 0)
            ? loaded.srsMaxDaily
            : DEFAULT_SETTINGS.srsMaxDaily;
        this.settings = merged;
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    isDebugModeEnabled(): boolean {
        return this.settings.debugModeEnabled;
    }

    isEstimateWarningEnabled(): boolean {
        return this.settings.estimateWarningEnabled;
    }

    isCheckboxOverrideEnabled(): boolean {
        return this.settings.checkboxOverrideEnabled;
    }

    isMobileLargeCheckboxEnabled(): boolean {
        return this.settings.mobileLargeCheckboxEnabled;
    }

    getUiLanguage(): UILanguage {
        return this.settings.uiLanguage;
    }

    async setUiLanguage(value: UILanguage): Promise<void> {
        this.settings.uiLanguage = value;
        await this.saveSettings();
    }

    t(key: TranslationKey, vars?: Record<string, string | number>): string {
        return translate(resolveLanguage(this.settings.uiLanguage), key, vars);
    }

    getRoutineFolder(): string {
        return this.settings.routineFolder;
    }

    getDailyNoteFolder(): string {
        return this.settings.dailyNoteFolder;
    }

    async setDailyNoteFolder(folder: string): Promise<void> {
        const normalized = normalizeDailyNoteFolder(folder);
        if (normalized === this.settings.dailyNoteFolder) return;
        this.settings.dailyNoteFolder = normalized;
        await this.saveSettings();
    }

    getSectionDefinitions(): SectionDefinition[] {
        return this.settings.sectionDefinitions.map((x) => ({ ...x }));
    }

    async setDebugModeEnabled(enabled: boolean): Promise<void> {
        this.settings.debugModeEnabled = enabled;
        await this.saveSettings();
        this.debugLog(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    async setEstimateWarningEnabled(enabled: boolean): Promise<void> {
        this.settings.estimateWarningEnabled = enabled;
        await this.saveSettings();
        this.debugLog(`Estimate warning ${enabled ? 'enabled' : 'disabled'}`);
    }

    async setCheckboxOverrideEnabled(enabled: boolean): Promise<void> {
        this.settings.checkboxOverrideEnabled = enabled;
        if (!enabled) {
            this.checkbox.reset();
        }
        await this.saveSettings();
        this.debugLog(`Checkbox override ${enabled ? 'enabled' : 'disabled'}`);
    }

    async setMobileLargeCheckboxEnabled(enabled: boolean): Promise<void> {
        this.settings.mobileLargeCheckboxEnabled = enabled;
        await this.saveSettings();
        this.syncMobileLargeCheckboxClass();
        this.debugLog(`Mobile large checkbox ${enabled ? 'enabled' : 'disabled'}`);
    }

    async setSrsGrowthEnabled(enabled: boolean): Promise<void> {
        this.settings.srsGrowthEnabled = enabled;
        this.routineEngine.setSrsGrowthEnabled(enabled);
        await this.saveSettings();
        this.debugLog(`SRS growth ${enabled ? 'enabled' : 'disabled'}`);
    }

    isSrsGrowthEnabled(): boolean {
        return this.settings.srsGrowthEnabled;
    }

    getSrsMaxDaily(): number {
        return this.settings.srsMaxDaily;
    }

    async setSrsMaxDaily(value: number): Promise<void> {
        this.settings.srsMaxDaily = value;
        await this.saveSettings();
        this.debugLog(`SRS max daily set to ${value}`);
    }

    async setSectionDefinitions(definitions: SectionDefinition[]): Promise<void> {
        this.settings.sectionDefinitions = normalizeSectionDefinitions(definitions);
        await this.saveSettings();
        this.debugLog('Section definitions updated', { sectionDefinitions: this.settings.sectionDefinitions });
    }

    async setRoutineFolder(folder: string): Promise<void> {
        const normalized = normalizeRoutineFolder(folder);
        const previous = this.settings.routineFolder;
        if (normalized === previous) return;

        this.settings.routineFolder = normalized;
        await this.saveSettings();
        this.routineEngine.setRoutineFolder(normalized);

        for (const timer of this.scheduleValidationTimers.values()) {
            clearTimeout(timer);
        }
        this.scheduleValidationTimers.clear();
        this.lastScheduleValidationError.clear();

        this.debugLog('Routine folder updated', {
            from: previous,
            to: normalized,
        });

        const summaryView = this.app.workspace.getLeavesOfType(VIEW_TYPE_SUMMARY)[0]?.view as SummaryView | undefined;
        if (summaryView) {
            void summaryView.requestRefresh();
        }
    }

    private syncMobileLargeCheckboxClass(): void {
        document.body.classList.toggle(
            'llr-mobile-large-checkbox',
            Platform.isMobile && this.settings.mobileLargeCheckboxEnabled
        );
    }

    private handleRoutineEngineDebugEvent(event: RoutineEngineDebugEvent): void {
        this.debug.emit(event.source, event.message, event.data);
    }

    private async runCommandWithDebug(commandId: string, commandName: string, fn: () => Promise<void> | void): Promise<void> {
        const startedAt = new Date();
        this.debug.emit('plugin', 'command:start', {
            commandId,
            commandName,
            startedAt: startedAt.toISOString(),
        });

        try {
            await fn();
            this.debug.emit('plugin', 'command:done', {
                commandId,
                commandName,
                finishedAt: new Date().toISOString(),
            });
        } catch (error) {
            this.debug.emit('plugin', 'command:error', {
                commandId,
                commandName,
                finishedAt: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    showLlrNotice(message: string, timeout = 5000): void {
        if (this.settings.debugModeEnabled) {
            const nowMs = Date.now();
            if (nowMs - this.lastDebugNoticeAtMs < this.debugNoticeThrottleMs) return;
            this.lastDebugNoticeAtMs = nowMs;
        }
        new Notice(message, timeout);
    }

    /** Debounce wrapper: waits 500ms after the last call before updating UI */
    private scheduleUIUpdate(): void {
        if (this.statusBarDebounce) clearTimeout(this.statusBarDebounce);
        this.statusBarDebounce = setTimeout(() => {
            this.statusBarDebounce = null;
            this.updateUI();
        }, 500);
    }

    private async activateView() {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_SUMMARY);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            // モバイルでの安定した表示のために getRightLeaf を優先
            leaf = workspace.getRightLeaf(false);
            if (!leaf) {
                // 右サイドバーが取得できない場合は新規作成（主にデスクトップ等でのフォールバック）
                leaf = workspace.getLeaf(true);
            }
            if (leaf) {
                await leaf.setViewState({ type: VIEW_TYPE_SUMMARY, active: true });
            }
        }

        if (leaf) {
            void workspace.revealLeaf(leaf);
            // モバイル環境でサイドバーが閉じている場合に確実に開く
            if (Platform.isMobile) {
                (this.app.workspace as unknown as { leftSplit?: { collapse?: () => void } }).leftSplit?.collapse?.(); // 左は閉じる（任意）
                (this.app.workspace as unknown as { rightSplit?: { expand?: () => void } }).rightSplit?.expand?.();
            }
        }
    }

    /** Parse the active Markdown note and update status bar items and sidebar view */
    private updateUI(): void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const summaryView = this.app.workspace.getLeavesOfType(VIEW_TYPE_SUMMARY)[0]?.view as SummaryView;

        // Hide when no markdown file is open
        if (!view?.file) {
            this.statusBar.setText('');
            if (summaryView) void summaryView.requestRefresh();
            return;
        }

        this.snapshots.prime(view.file);

        const content = view.editor.getValue();
        const lines = content.split('\n');
        const cursorLine = view.editor.getCursor().line;
        const now = new Date();
        const nowTime = formatTime(now);

        // 1. Status Bar update
        const { remainMin, cursorMin } = computeStatusBarMetrics(
            lines,
            cursorLine,
            nowTime,
            calculateDuration
        );


        // Format total (Remaining)
        const totalText = remainMin > 0
            ? `total: ${Math.floor(remainMin / 60)}h${remainMin % 60}m`
            : 'total: -';

        // Format end time (now + remaining)
        let endText = 'end: -';
        if (remainMin > 0) {
            const endDate = new Date(now.getTime() + remainMin * 60 * 1000);
            const hh = endDate.getHours().toString().padStart(2, '0');
            const mm = endDate.getMinutes().toString().padStart(2, '0');
            endText = `end: ${hh}:${mm}`;
        }

        // Format cursor arrival time (now + sum up to cursor line)
        let cursorText = '';
        if (cursorMin > 0) {
            const cursorDate = new Date(now.getTime() + cursorMin * 60 * 1000);
            const hh = cursorDate.getHours().toString().padStart(2, '0');
            const mm = cursorDate.getMinutes().toString().padStart(2, '0');
            cursorText = `${hh}:${mm}`;
        }

        // Build combined status bar text: total: 3h0m | 11:30 | end: 15:30
        let text = totalText;
        if (cursorText) text += ` | ${cursorText}`;
        text += ` | ${endText}`;
        this.statusBar.setText(text);

        // 2. Sidebar View update (Self-updates via metadataCache, but can be forced if needed)
        // Note: SummaryView tracks its own target daily note based on the view's current date state.
    }

    private handleDocumentBeforeInput(ev: InputEvent): void {
        this.logEditorInputEvent('beforeinput', ev);
    }

    private handleDocumentInput(ev: InputEvent): void {
        this.logEditorInputEvent('input', ev);
    }

    private handleDocumentCompositionEvent(phase: 'compositionstart' | 'compositionend', ev: CompositionEvent): void {
        if (!this.settings.debugModeEnabled) return;

        const context = this.getEditorEventContext(ev.target);
        if (!context) return;

        this.debug.emit('plugin', `Editor ${phase}`, {
            pointerType: this.checkbox.lastPointerDownType,
            line: context.cursor.line,
            ch: context.cursor.ch,
            currentLinePreview: context.lineText.slice(0, 120),
            data: ev.data ?? '',
        }, { notice: false });
    }

    private logEditorInputEvent(phase: 'beforeinput' | 'input', ev: InputEvent): void {
        if (!this.settings.debugModeEnabled) return;

        const context = this.getEditorEventContext(ev.target);
        if (!context) return;

        this.debug.emit('plugin', `Editor ${phase}`, {
            pointerType: this.checkbox.lastPointerDownType,
            line: context.cursor.line,
            ch: context.cursor.ch,
            currentLinePreview: context.lineText.slice(0, 120),
            data: ev.data ?? '',
            inputType: ev.inputType ?? '',
            isComposing: ev.isComposing,
        }, { notice: false });
    }

    private getEditorEventContext(target: EventTarget | null): { view: MarkdownView; cursor: EditorPosition; lineText: string } | null {
        if (!(target instanceof Node)) return null;

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.editor || !view.contentEl.contains(target)) return null;

        const cursor = view.editor.getCursor();
        return {
            view,
            cursor,
            lineText: view.editor.getLine(cursor.line),
        };
    }

    private isEditableMarkdownView(): boolean {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return false;
        if (!this.isDailyNoteFile(view.file)) return false;
        return !!view.editor;
    }

    private ensureDailyNoteView(view: MarkdownView, actionLabel = 'This action'): boolean {
        if (view.file && this.isDailyNoteFile(view.file)) return true;
        this.showLlrNotice(`LLR: ${actionLabel} はデイリーノートで使ってください。`);
        return false;
    }

    private async handleCheckboxPress(
        intent: CheckboxPressIntent,
        lineIndex: number | null
    ): Promise<void> {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file || !view.editor) return;

        const editor = view.editor;
        if (lineIndex === null) {
            this.debugLog('Could not identify tapped line. Operation aborted.');
            return;
        }

        const targetLine = lineIndex;
        const lineText = editor.getLine(targetLine);
        this.debugLog('Checkbox press resolved', {
            intent,
            lineIndex: targetLine,
            lineStateBefore: this.getTaskLineState(lineText),
            lineTextPreview: lineText.slice(0, 120),
        });
        const now = new Date();
        const result = transformCheckboxPress(
            lineText,
            now,
            intent,
            this.buildCheckboxPressOptionsForLine(editor, targetLine, lineText, intent, now)
        );
        if (!result) {
            this.debugLog('Checkbox press no-op', {
                intent,
                lineIndex: targetLine,
                lineStateBefore: this.getTaskLineState(lineText),
            });
            this.scheduleUIUpdate();
            return;
        }
        this.debugLog('Checkbox press transformed', {
            intent,
            lineIndex: targetLine,
            resultType: result.type,
            resultPreview: result.content.slice(0, 120),
        });

        await this.applyTaskResult(editor, view, targetLine, lineText, result, {
            placeCursorBeforeActualStart: this.shouldPlaceCursorBeforeActualStart(lineText, result),
        });
        await this.runPostLlrActionAdjustments(editor, view, 'checkbox press');
        this.scheduleUIUpdate();
    }

    private buildCheckboxPressOptionsForLine(
        editor: Editor,
        lineIndex: number,
        lineText: string,
        intent: CheckboxPressIntent,
        now: Date
    ): { unstartedLongPressStartTime?: string } {
        if (intent !== 'long') return {};
        if (this.getTaskLineState(lineText) !== 'unstarted') return {};

        const previousCompletionTime = this.findPreviousCompletionEndTime(editor, lineIndex);
        if (previousCompletionTime) {
            this.debugLog('Checkbox long press uses previous completion time', {
                lineIndex,
                previousCompletionTime,
            });
            return { unstartedLongPressStartTime: previousCompletionTime };
        }

        const fallback = formatTime(now);
        this.debugLog('Checkbox long press previous completion time not found; fallback to now', {
            lineIndex,
            fallback,
        });
        return { unstartedLongPressStartTime: fallback };
    }

    private getTaskLineState(lineText: string): 'unstarted' | 'running' | 'complete' | 'other' {
        if (lineText.startsWith('- [/]')) return 'running';
        if (lineText.startsWith('- [x]')) return 'complete';
        if (lineText.startsWith('- [ ]') || !lineText.startsWith('- [')) return 'unstarted';
        return 'other';
    }

    private getLineTextAt(lineIndex: number): string {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = view?.editor;
        if (!editor) return '';
        try {
            return editor.getLine(lineIndex) ?? '';
        } catch {
            return '';
        }
    }

    private findPreviousCompletionEndTime(editor: Editor, fromLine: number): string | null {
        const lines: string[] = [];
        const totalLines = editor.lineCount ? editor.lineCount() : 0;

        for (let line = 0; line < totalLines; line++) {
            if (line === fromLine) continue;
            lines.push(editor.getLine(line));
        }

        return findLatestCompletionEndTime(lines, formatTime(new Date()));
    }

    private isRootRoutineNotePath(filePath: string): boolean {
        const folderPrefix = `${this.settings.routineFolder}/`;
        if (!filePath.startsWith(folderPrefix) || !filePath.endsWith('.md')) return false;
        const afterFolder = filePath.slice(folderPrefix.length);
        return !afterFolder.includes('/');
    }

    private isDailyNoteFile(file: TFile): boolean {
        return isDailyNoteMatch(
            file,
            this.getDailyNoteSettings(),
            (dateString, format) => this.parseDailyNoteDateString(dateString, format)
        );
    }

    private parseDailyNoteDate(file: TFile): Date | null {
        return resolveDailyNoteDate(
            file,
            this.getDailyNoteSettings(),
            (dateString, format) => this.parseDailyNoteDateString(dateString, format)
        );
    }

    private getDailyNoteSettings(): DailyNoteSettingsSpec {
        type InternalPlugins = { getPluginById?: (id: string) => { enabled?: boolean; instance?: { options?: Record<string, unknown> } } | null };
        const internalPlugins = (this.app as unknown as { internalPlugins?: InternalPlugins }).internalPlugins;
        const dailyNotesPlugin = internalPlugins?.getPluginById?.('daily-notes');
        const options = (dailyNotesPlugin?.instance?.options ?? {});
        const pluginFolder = typeof options.folder === 'string' ? options.folder : '';
        return {
            enabled: !!dailyNotesPlugin?.enabled,
            format: (typeof options.format === 'string' ? options.format : '') || 'YYYY-MM-DD',
            folder: resolveDailyNoteFolder(pluginFolder, this.settings.dailyNoteFolder),
        };
    }

    private parseDailyNoteDateString(dateString: string, format: string): Date | null {
        const parsed = moment(dateString, format, true);
        return parsed.isValid() ? parsed.toDate() : null;
    }

    private shouldApplyAtDoneToRoutine(routineNote: RoutineNote | null, completionDate: Date): routineNote is RoutineNote {
        if (!routineNote?.next_due) return false;

        const leadDays = routineNote.start_before ?? 0;
        if (leadDays <= 0) return false;

        const completionDay = moment(completionDate).format('YYYY-MM-DD');
        const visibleFrom = moment(routineNote.next_due).subtract(leadDays, 'days').format('YYYY-MM-DD');
        return completionDay >= visibleFrom && completionDay <= routineNote.next_due;
    }

    private getSortedSectionBoundaries(): Array<{ value: number; label: string }> {
        return this.settings.sectionDefinitions
            .map((def) => {
                const value = parseSectionTimeToInt(def.time);
                return value === null ? null : { value, label: def.label };
            })
            .filter((x): x is { value: number; label: string } => !!x)
            .sort((a, b) => a.value - b.value || a.label.localeCompare(b.label, 'ja'));
    }

    private getRoutineSectionHeading(section: number | undefined): string | null {
        if (typeof section !== 'number' || !Number.isFinite(section)) return null;
        const boundaries = this.getSortedSectionBoundaries();
        if (boundaries.length === 0) return null;

        let selected: { value: number; label: string } | null = null;
        for (const boundary of boundaries) {
            if (section >= boundary.value) {
                selected = boundary;
                continue;
            }
            break;
        }
        return selected ? `# ${selected.label}` : null;
    }

    onunload() {
        console.debug('Unloading Llr Plugin...');
        document.body.classList.remove('llr-mobile-large-checkbox');
        if (this.statusBarDebounce) clearTimeout(this.statusBarDebounce);
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.checkbox.reset();
        for (const timer of this.scheduleValidationTimers.values()) {
            clearTimeout(timer);
        }
        this.dailyAutoInsert.clearTimers();
        for (const timer of this.metadataChangedTimers.values()) {
            clearTimeout(timer);
        }
        this.metadataChangedTimers.clear();
        this.scheduleValidationTimers.clear();
        this.lastScheduleValidationError.clear();
        this.snapshots.clear();
        // Flush any pending routine updates immediately before unload
        this.routineEngine.flushAll().catch(e => console.error('[LLR] flushAll error:', e));
    }

    /**
     * Reacts to metadata changes in any file to manage routine update reservations.
     * This "Reactive" approach handles toggles (taps/commands), manual edits, undo/redo etc.
     */
    private scheduleMetadataChangedProcessing(file: TFile): void {
        const existing = this.metadataChangedTimers.get(file.path);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
            this.metadataChangedTimers.delete(file.path);
            void this.onMetadataChanged(file);
        }, 80);

        this.metadataChangedTimers.set(file.path, timer);
    }

    private async onMetadataChanged(file: TFile): Promise<void> {
        if (file.extension !== 'md') return;
        if (!this.isDailyNoteFile(file)) {
            this.snapshots.delete(file.path);
            return;
        }

        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const processedAtDoneCompletions = new Map<string, Set<string>>();
        if (activeView?.file?.path === file.path) {
            await this.processPendingRoutineAtDoneMarkersInEditor({
                editor: activeView.editor,
                view: activeView,
                file,
                reason: 'metadata-changed',
                processedAtDoneCompletions,
            });
        }

        const currentSnapshot = this.snapshots.build(file);
        if (!currentSnapshot) {
            this.snapshots.delete(file.path);
            return;
        }

        const previousSnapshot = this.snapshots.get(file.path);
        this.snapshots.set(file.path, currentSnapshot);

        // First observation for this file becomes the baseline to avoid replaying
        // all already-completed routine tasks.
        if (!previousSnapshot) {
            if (currentSnapshot.size > 0) {
                this.debugLog('Routine completion snapshot initialized', {
                    file: file.path,
                    trackedItems: currentSnapshot.size,
                });
            }
            return;
        }

        const routinePaths = new Set<string>([
            ...currentSnapshot.keys(),
            ...previousSnapshot.keys(),
        ]);

        for (const routinePath of routinePaths) {
            const current = currentSnapshot.get(routinePath) ?? this.snapshots.createEmptyEntry();
            const prev = previousSnapshot.get(routinePath) ?? this.snapshots.createEmptyEntry();

            if (prev.completedCount === current.completedCount) {
                continue;
            }

            const routineFile = this.app.vault.getAbstractFileByPath(routinePath);
            if (!(routineFile instanceof TFile)) continue;

            const completionDelta = current.completedCount - prev.completedCount;
            const completionBaseDate = resolveMutationReferenceDate(this.parseDailyNoteDate(file), new Date());
            const suppressedCompletedSignatures = processedAtDoneCompletions.get(routinePath) ?? new Set<string>();
            const addedCompletedSignatures = completionDelta > 0
                ? [...current.completedSignatures]
                    .filter((signature) => !prev.completedSignatures.has(signature))
                    .filter((signature) => !suppressedCompletedSignatures.has(signature))
                : [];
            const hasAtDoneCompletion = addedCompletedSignatures.some((signature) =>
                current.atDoneCompletedSignatures.has(signature)
            );
            const completionRequest: RoutineCompletionRequest | null = addedCompletedSignatures.length > 0
                ? {
                    completionDate: completionBaseDate,
                    mode: hasAtDoneCompletion ? 'advanceFromDue' : 'normal',
                }
                : null;
            this.debugLog('Routine completion state changed', {
                file: file.path,
                routinePath,
                completionBaseDate: completionBaseDate.toISOString(),
                totalCount: current.totalCount,
                completedCount: {
                    from: prev.completedCount,
                    to: current.completedCount,
                    delta: completionDelta,
                },
                suppressedCompletedSignatures: [...suppressedCompletedSignatures],
                addedCompletedSignatures,
                completionMode: completionRequest?.mode ?? null,
            });

            // Trigger engine only when the count of completed items changes.
            this.routineEngine.scheduleUpdate(
                routineFile,
                file.path,
                completionRequest
            );
        }

        // SRS バッチ区間が全完了なら次のバッチを補充する
        if (activeView?.file?.path === file.path) {
            await this.replenishSrsBatchIfNeeded(activeView.editor, file);
        }
    }

    private scheduleRoutineScheduleValidation(file: TFile): void {
        if (!this.isRootRoutineNotePath(file.path)) return;

        const existing = this.scheduleValidationTimers.get(file.path);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
            this.scheduleValidationTimers.delete(file.path);
            this.validateRoutineSchedule(file);
        }, 150);

        this.scheduleValidationTimers.set(file.path, timer);
    }

    private validateRoutineSchedule(file: TFile): void {
        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        if (!fm) {
            this.lastScheduleValidationError.delete(file.path);
            return;
        }

        const hasRepeat = typeof fm.repeat === 'string' || typeof fm.repeat === 'number';
        const hasSchedule = typeof fm.schedule === 'string' && fm.schedule.trim().length > 0;
        if (!hasRepeat && !hasSchedule) {
            this.lastScheduleValidationError.delete(file.path);
            return;
        }

        try {
            if (hasRepeat) {
                parseRepeatExpression(fm.repeat);
            } else {
                parseScheduleExpression(fm.schedule);
            }
            this.lastScheduleValidationError.delete(file.path);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid repeat expression';
            const prev = this.lastScheduleValidationError.get(file.path);
            if (prev !== message) {
                this.lastScheduleValidationError.set(file.path, message);
                this.showLlrNotice(`LLR repeat error (${file.basename}): ${message}`, 8000);
            }
        }
    }

    async handleToggleTask(editor: Editor, view: MarkdownView, forceAction?: 'start' | 'complete' | 'interrupt' | 'duplicate' | 'retroComplete' | 'taskify') {
        this.debugLog('handleToggleTask entry', { forceAction });
        if (!this.ensureDailyNoteView(view, 'Toggle Task')) return;

        if (!forceAction) {
            const from = editor.getCursor('from');
            const to = editor.getCursor('to');
            if (from.line !== to.line) {
                let changedCount = 0;
                const now = new Date();
                for (let line = from.line; line <= to.line; line++) {
                    const current = editor.getLine(line);
                    const result = transformTaskLine(current, now, 'taskify');
                    if (!result || result.type !== 'update' || result.content === current) continue;
                    editor.setLine(line, result.content);
                    changedCount++;
                }
                this.debugLog('Toggle Task batch taskify', {
                    fromLine: from.line,
                    toLine: to.line,
                    changedCount,
                });
                return;
            }
        }

        const cursor = editor.getCursor();
        let lineText = editor.getLine(cursor.line);
        this.debugLog('Current line content', { line: cursor.line, text: lineText });

        // For completed-task toggles, normalize drift on the source line first.
        // This enforces the order: fix drift -> recalc estimate -> duplicate.
        if (lineText.trim().startsWith('- [x]')) {
            const normalizedCurrent = normalizeCompletedTaskActualDuration(lineText);
            if (normalizedCurrent && normalizedCurrent !== lineText) {
                editor.replaceRange(normalizedCurrent, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: lineText.length });
                lineText = normalizedCurrent;
                this.debugLog('Normalized current completed line before toggle', {
                    line: cursor.line,
                    normalized: normalizedCurrent,
                });
            }
        }

        const now = new Date();
        const delegatedAction = forceAction ?? this.resolveDefaultToggleDelegatedAction(lineText);
        const result = transformTaskLine(lineText, now, delegatedAction);

        if (!result) {
            const reason = forceAction
                ? `Action '${forceAction}' is not applicable to current state.`
                : 'No transformation needed or indented line.';

            this.debugLog('Command Ignored:', { reason, lineText });
            if (forceAction) {
                this.showLlrNotice(`LLR: Command ignored. (${reason})`);
            }
            return;
        }

        const shouldSkipAtDoneOnCurrentLine = forceAction === 'start'
            || (!forceAction && lineText.trim().startsWith('- [ ]'));

        await this.applyTaskResult(editor, view, cursor.line, lineText, result, {
            placeCursorBeforeActualStart: this.shouldPlaceCursorBeforeActualStart(lineText, result),
        });
        await this.runPostLlrActionAdjustments(editor, view, 'toggle task', {
            skipAtDoneLineIndexes: shouldSkipAtDoneOnCurrentLine ? new Set([cursor.line]) : undefined,
        });
    }

    private resolveDefaultToggleDelegatedAction(lineText: string): 'taskify' | 'complete' | 'duplicate' | undefined {
        const trimmed = lineText.trim();
        if (!trimmed) return undefined;
        if (!/^- \[[ /x]\]/.test(trimmed)) return 'taskify';
        if (trimmed.startsWith('- [/]')) return 'complete';
        if (trimmed.startsWith('- [x]')) return 'duplicate';
        return undefined;
    }

    async handleStartTaskFromPreviousCompletion(editor: Editor, view: MarkdownView): Promise<void> {
        if (!this.ensureDailyNoteView(view, 'Start Task (Align to Previous Completion)')) return;
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);
        const state = this.getTaskLineState(lineText);

        if (state !== 'unstarted') {
            this.showLlrNotice('LLR: 「前に合わせる」は未着手タスクで使ってください。');
            return;
        }

        const now = new Date();
        const previousCompletionTime = this.findPreviousCompletionEndTime(editor, cursor.line);
        const fallback = formatTime(now);
        const startTime = previousCompletionTime ?? fallback;

        this.debugLog('Start task from previous completion', {
            line: cursor.line,
            startTime,
            previousCompletionTimeFound: !!previousCompletionTime,
        });

        const result = transformCheckboxPress(lineText, now, 'long', {
            unstartedLongPressStartTime: startTime,
        });
        if (!result) return;
        await this.applyTaskResult(editor, view, cursor.line, lineText, result, {
            placeCursorBeforeActualStart: this.shouldPlaceCursorBeforeActualStart(lineText, result),
        });
        await this.runPostLlrActionAdjustments(editor, view, 'start task from previous completion', {
            skipAtDoneLineIndexes: new Set([cursor.line]),
        });
    }

    async handleResetTaskKeepTime(editor: Editor, view: MarkdownView): Promise<void> {
        if (!this.ensureDailyNoteView(view, 'Reset Task')) return;
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);
        const state = this.getTaskLineState(lineText);

        if (state !== 'running' && state !== 'complete') {
            this.showLlrNotice('LLR: 時刻を残して戻す対象は進行中/完了タスクです。');
            return;
        }

        const result = transformCheckboxPress(lineText, new Date(), 'long');
        if (!result) return;
        await this.applyTaskResult(editor, view, cursor.line, lineText, result);
        await this.runPostLlrActionAdjustments(editor, view, 'reset task keep time');
    }

    async handleAdjustTime(editor: Editor, view: MarkdownView, deltaMinutes: number): Promise<void> {
        if (!this.ensureDailyNoteView(view, 'Adjust Time')) return;
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);
        const result = adjustTaskTimeByMinutes(lineText, deltaMinutes);
        if (!result) {
            this.debugLog('Adjust time ignored', { line: cursor.line, deltaMinutes, lineText });
            return;
        }

        this.debugLog('Adjust time', {
            line: cursor.line,
            deltaMinutes,
            before: lineText,
            after: result.content,
        });
        await this.applyTaskResult(editor, view, cursor.line, lineText, result);
        await this.runPostLlrActionAdjustments(editor, view, 'adjust time');
    }

    async handleFixDurationDriftAll(editor: Editor, view: MarkdownView): Promise<void> {
        if (!this.ensureDailyNoteView(view, 'Fix Duration Drift (All Completed Tasks)')) return;
        if (!view.file) return;

        const changedCount = this.fixDurationDriftAcrossEditor(editor);
        const atDoneCount = await this.processPendingRoutineAtDoneMarkersInEditor({
            editor,
            view,
            file: view.file,
            reason: 'fix-duration-drift-all',
        });
        const markerCount = await this.processPendingRoutineRescheduleMarkersInEditor({
            editor,
            view,
            file: view.file,
            reason: 'fix-duration-drift-all',
        });

        this.debugLog('Fix duration drift (all) done', { changedCount, atDoneCount, markerCount });
        this.showLlrNotice(`LLR: 実績時間のズレを ${changedCount} 行修正しました。`);
    }

    private fixDurationDriftAcrossEditor(editor: Editor): number {
        let changedCount = 0;
        const cursor = editor.getCursor();
        const lastLine = editor.lastLine();
        for (let line = 0; line <= lastLine; line++) {
            const current = editor.getLine(line);
            const normalized = normalizeCompletedTaskActualDuration(current);
            if (!normalized || normalized === current) continue;
            editor.replaceRange(normalized, { line, ch: 0 }, { line, ch: current.length });
            changedCount++;
        }
        if (changedCount > 0) {
            const cursorLine = Math.min(cursor.line, editor.lastLine());
            const cursorCh = Math.min(cursor.ch, editor.getLine(cursorLine).length);
            editor.setCursor({ line: cursorLine, ch: cursorCh });
        }
        return changedCount;
    }

    private async runPostLlrActionAdjustments(
        editor: Editor,
        view: MarkdownView,
        reason: string,
        options: { skipAtDoneLineIndexes?: Set<number> } = {}
    ): Promise<void> {
        const file = view.file;
        if (!file) return;

        const context: LlrPostActionContext = { editor, view, file, reason, skipAtDoneLineIndexes: options.skipAtDoneLineIndexes };
        const results: LlrPostActionPassResult[] = [
            {
                kind: 'routine-atdone-marker',
                changedCount: await this.processPendingRoutineAtDoneMarkersInEditor(context),
            },
            {
                kind: 'duration-drift',
                changedCount: this.fixDurationDriftAcrossEditor(editor),
            },
            {
                kind: 'routine-reschedule-marker',
                changedCount: await this.processPendingRoutineRescheduleMarkersInEditor(context),
            },
        ];

        for (const result of results) {
            if (result.changedCount <= 0) continue;
            this.debugLog('Post LLR action pass applied', {
                reason,
                pass: result.kind,
                changedCount: result.changedCount,
                file: file.path,
            });
        }
    }

    async handleDeferTaskToTomorrow(editor: Editor, view: MarkdownView): Promise<void> {
        if (!this.ensureDailyNoteView(view, 'Skip Task (Log Only)')) return;

        const cursor = editor.getCursor();
        const lineIndex = cursor.line;
        const lineText = editor.getLine(lineIndex);

        if (lineText.startsWith('- [ ]')) {
            const skipLine = this.buildSkippedTaskLogLine(lineText);
            editor.replaceRange(skipLine, { line: lineIndex, ch: 0 }, { line: lineIndex, ch: lineText.length });
            editor.setCursor(lineIndex, skipLine.length);
            this.debugLog('Task converted to skip log', {
                lineIndex,
                skipLine,
            });
            await this.runPostLlrActionAdjustments(editor, view, 'skip-task-log-only');
            return;
        }

        if (/^- skip:\s*/i.test(lineText)) {
            const taskLine = this.buildUnskippedTaskLine(lineText);
            editor.replaceRange(taskLine, { line: lineIndex, ch: 0 }, { line: lineIndex, ch: lineText.length });
            editor.setCursor(lineIndex, taskLine.length);
            this.debugLog('Skip log restored to task', {
                lineIndex,
                taskLine,
            });
            return;
        }

        this.showLlrNotice('LLR: 「Skip Task」は未着手行または skip ログ行で使ってください。');
    }

    private buildSkippedTaskLogLine(lineText: string): string {
        return lineText.replace(/^- \[ \]\s*/, '- skip: ');
    }

    private buildUnskippedTaskLine(lineText: string): string {
        return lineText.replace(/^- skip:\s*/i, '- [ ] ');
    }

    private isRoutineRescheduleEligibleLine(lineText: string): boolean {
        const trimmed = lineText.trim();
        return /^- \[[ /x]\]/.test(trimmed) || /^- skip:\s*/i.test(trimmed);
    }

    private isRoutineAtDoneEligibleLine(lineText: string): boolean {
        return this.isRoutineRescheduleEligibleLine(lineText);
    }

    private async processPendingRoutineAtDoneMarkersInEditor(context: LlrPostActionContext): Promise<number> {
        const { editor, view, file, reason } = context;
        if (!this.ensureDailyNoteView(view, '@done')) return 0;
        if (this.isFutureDailyNoteFile(file)) return 0;

        let processedCount = 0;
        const completionBaseDate = resolveMutationReferenceDate(this.parseDailyNoteDate(file), new Date());

        for (let lineIndex = 0; lineIndex <= editor.lastLine(); lineIndex++) {
            const lineText = editor.getLine(lineIndex);
            if (context.skipAtDoneLineIndexes?.has(lineIndex)) continue;
            if (!this.isRoutineAtDoneEligibleLine(lineText)) continue;
            if (!hasPendingRoutineAtDoneMarker(lineText)) continue;

            const routineFile = this.resolveSingleRoutineFileForLine(lineText, file.path);
            if (!routineFile) continue;

            const routineNote = this.routineEngine.readRoutineNote(routineFile);
            if (!this.shouldApplyAtDoneToRoutine(routineNote, completionBaseDate)) continue;

            const updatedLine = replacePendingRoutineAtDoneMarker(lineText);
            if (!updatedLine) continue;

            await this.routineEngine.processCompletion(routineNote, completionBaseDate, { mode: 'advanceFromDue' });

            if (context.processedAtDoneCompletions && TaskParser.parseLine(lineText).status === 'x') {
                const signature = buildRoutineCompletionSignature(lineIndex, updatedLine);
                const signatures = context.processedAtDoneCompletions.get(routineFile.path) ?? new Set<string>();
                signatures.add(signature);
                context.processedAtDoneCompletions.set(routineFile.path, signatures);
            }

            editor.replaceRange(updatedLine, { line: lineIndex, ch: 0 }, { line: lineIndex, ch: lineText.length });
            processedCount += 1;
            this.debugLog('Routine @done marker applied', {
                reason,
                file: file.path,
                lineIndex,
                routinePath: routineFile.path,
                completionBaseDate: completionBaseDate.toISOString(),
                originalLine: lineText,
                updatedLine,
            });
        }

        return processedCount;
    }

    private async processPendingRoutineRescheduleMarkersInEditor(context: LlrPostActionContext): Promise<number> {
        const { editor, view, file, reason } = context;
        if (!this.ensureDailyNoteView(view, 'Reschedule Routine')) return 0;
        if (this.isFutureDailyNoteFile(file)) return 0;

        let processedCount = 0;
        const baseDate = new Date();
        baseDate.setHours(0, 0, 0, 0);

        for (let lineIndex = 0; lineIndex <= editor.lastLine(); lineIndex++) {
            const lineText = editor.getLine(lineIndex);
            if (!this.isRoutineRescheduleEligibleLine(lineText)) continue;

            const marker = parseRoutineRescheduleMarker(lineText, baseDate);
            if (!marker) continue;

            const routineFile = this.resolveSingleRoutineFileForLine(lineText, file.path);
            if (!routineFile) continue;

            const routineNote = this.routineEngine.readRoutineNote(routineFile);
            if (!routineNote) continue;

            if (routineNote.next_due !== marker.canonicalDate) {
                await this.routineEngine.updateNextDue(routineFile, { nextDue: marker.canonicalDate });
            }

            const updatedLine = replaceRoutineRescheduleMarker(lineText, marker);
            editor.replaceRange(updatedLine, { line: lineIndex, ch: 0 }, { line: lineIndex, ch: lineText.length });
            processedCount += 1;
            this.debugLog('Routine reschedule marker applied', {
                reason,
                file: file.path,
                lineIndex,
                routinePath: routineFile.path,
                nextDue: marker.canonicalDate,
                originalLine: lineText,
                updatedLine,
            });
        }

        return processedCount;
    }

    private isFutureDailyNoteFile(file: TFile): boolean {
        const noteDate = this.parseDailyNoteDate(file);
        if (!noteDate) return false;

        const normalizedNote = new Date(noteDate);
        normalizedNote.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return normalizedNote.getTime() > today.getTime();
    }

    private resolveSingleRoutineFileForLine(lineText: string, sourcePath: string): TFile | null {
        const linkTexts = this.routineEngine.extractLinkTexts(lineText);
        const resolved = linkTexts
            .map((linkText) => this.routineEngine.resolveRoutineFile(linkText, sourcePath))
            .filter((file): file is TFile => file instanceof TFile);

        const uniqueByPath = [...new Map(resolved.map((file) => [file.path, file])).values()];
        if (uniqueByPath.length !== 1) return null;
        return uniqueByPath[0];
    }

    async handleRescheduleRoutine(editor: Editor, view: MarkdownView): Promise<void> {
        if (!this.ensureDailyNoteView(view, 'Reschedule Routine')) return;
        if (!view.file) return;

        if (this.isFutureDailyNoteFile(view.file)) {
            this.showLlrNotice('LLR: 未来日のデイリーノートではルーチン先送りを実行しません。');
            return;
        }

        const processedCount = await this.processPendingRoutineRescheduleMarkersInEditor({
            editor,
            view,
            file: view.file,
            reason: 'reschedule-routine-command',
        });
        if (processedCount === 0) {
            this.showLlrNotice('LLR: このページで処理できる routine の @日付 は見つかりませんでした。');
            return;
        }
        this.showLlrNotice(`LLR: routine の先送りを ${processedCount} 件反映しました。`);
    }

    private removeEditorLine(editor: Editor, lineIndex: number, lineText: string): void {
        const lastLine = editor.lastLine();
        if (lastLine === 0) {
            editor.replaceRange('', { line: lineIndex, ch: 0 }, { line: lineIndex, ch: lineText.length });
            editor.setCursor(0, 0);
            return;
        }

        if (lineIndex < lastLine) {
            editor.replaceRange('', { line: lineIndex, ch: 0 }, { line: lineIndex + 1, ch: 0 });
            editor.setCursor(Math.min(lineIndex, editor.lastLine()), 0);
            return;
        }

        const previousLine = Math.max(0, lineIndex - 1);
        editor.replaceRange('', { line: previousLine, ch: editor.getLine(previousLine).length }, { line: lineIndex, ch: lineText.length });
        editor.setCursor(previousLine, editor.getLine(previousLine).length);
    }

    private shouldPlaceCursorBeforeActualStart(
        previousLineText: string,
        result: { type: 'update' | 'insert' | 'complete' | 'interrupt' | 'none'; content: string; extraContent?: string }
    ): boolean {
        if (result.type !== 'update' && result.type !== 'insert') return false;
        return !previousLineText.startsWith('- [/]') && result.content.startsWith('- [/]');
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- Multiple callers await this in async chains; body is sync today but the Promise contract is preserved
    private async applyTaskResult(
        editor: Editor,
        view: MarkdownView,
        lineIndex: number,
        lineText: string,
        result: { type: 'update' | 'insert' | 'complete' | 'interrupt' | 'none'; content: string; extraContent?: string },
        options: ApplyTaskResultOptions = {}
    ): Promise<void> {
        const { content: effectiveContent, ch: nextCursorCh } = options.placeCursorBeforeActualStart
            ? prepareCursorBeforeActualStart(result.content)
            : { content: result.content, ch: result.content.length };

        switch (result.type) {
            case 'update':
                editor.replaceRange(effectiveContent, { line: lineIndex, ch: 0 }, { line: lineIndex, ch: lineText.length });
                editor.setCursor(lineIndex, nextCursorCh);
                this.debugLog('Task updated', { content: effectiveContent });
                // No manual call needed here anymore, onMetadataChanged will catch it
                break;
            case 'insert':
                editor.replaceRange('\n' + effectiveContent, { line: lineIndex, ch: lineText.length });
                editor.setCursor(lineIndex + 1, nextCursorCh);
                this.debugLog('New task inserted', { content: effectiveContent });
                break;
            case 'complete':
                this.debugLog('Action: Complete (via transformer signal)');
                this.completeTask(editor, view, lineIndex, lineText);
                break;
            case 'interrupt': {
                editor.replaceRange(result.content, { line: lineIndex, ch: 0 }, { line: lineIndex, ch: lineText.length });
                if (result.extraContent) {
                    editor.replaceRange(`\n${result.extraContent}`, { line: lineIndex, ch: result.content.length });
                    editor.setCursor(lineIndex + 1, result.extraContent.length);
                } else {
                    editor.setCursor(lineIndex, result.content.length);
                }
                this.debugLog('Task interrupted (complete + duplicate)', {
                    content: result.content,
                    extraContent: result.extraContent
                });
                break;
            }
            case 'none':
                break;
        }
    }

    completeTask(editor: Editor, view: MarkdownView, lineIndex: number, lineText: string) {
        const now = new Date();
        const endTimeStr = formatTime(now);

        const parsed = TaskParser.parseLine(lineText);
        const startTimeStr = parsed.status === '/' ? parsed.actualStart : undefined;
        if (!startTimeStr) {
            this.debugLog('Complete failed: No running start time found in line', { lineText, parsed });
            this.showLlrNotice('LLR: Start time not found.');
            return;
        }

        const duration = calculateDuration(startTimeStr, endTimeStr);

        this.debugLog('Completing Task...', {
            lineIndex,
            lineText,
            startTimeStr,
            endTimeStr,
            duration
        });

        const indentMatch = lineText.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '';
        const newLine = `${indent}${TaskParser.serialize({
            ...parsed,
            body: parsed.body,
            status: 'x',
            actualStart: startTimeStr,
            actualEnd: endTimeStr,
            estimate: parsed.estimate ? parsed.estimate.split('>')[0].trim() : '',
            actualDuration: `${duration}m`,
            marker: null,
            times: [startTimeStr, endTimeStr],
        })}`;

        // setLine よりも replaceRange の方が Live Preview のウィジェット更新がかかりやすい
        editor.replaceRange(newLine, { line: lineIndex, ch: 0 }, { line: lineIndex, ch: lineText.length });
        editor.setCursor(lineIndex, getCursorAfterActualEndCh(newLine, endTimeStr));

        // Force CM6 widget re-render (needed when triggered from click handler)
        requestAnimationFrame(() => {
            const cmView = getCM6View(editor);
            if (cmView && typeof cmView.dispatch === 'function') {
                cmView.dispatch({});
            }
        });
        this.debugLog('completeTask result:', { newLine });

        // No manual call needed here anymore, onMetadataChanged will catch it
    }


    // eslint-disable-next-line @typescript-eslint/require-await -- Callers await in async chains; body is sync today but the Promise contract is preserved
    private async buildRoutineInsertLines(targetDate: Date): Promise<string[]> {
        const dueRoutines = this.routineEngine.fetchDueRoutines(targetDate);

        if (dueRoutines.length === 0) {
            return [];
        }

        const routineNotes = dueRoutines.filter(r => !r.isSrs);
        let srsNotes = dueRoutines.filter(r => r.isSrs);

        const todayStr = targetDate.toISOString().slice(0, 10);
        const srsSorted = sortSrsCandidatesByOverdue(
            srsNotes.map(r => ({ basename: r.file.basename, next_due: r.next_due, start: r.start, estimate: r.estimate })),
            todayStr
        );

        const max = this.settings.srsMaxDaily;
        const srsBatch = max > 0 && srsSorted.length > max ? srsSorted.slice(0, max) : srsSorted;

        const sortKey = (r: typeof routineNotes[0]): [number, number] => {
            const sec = r.section ?? -Infinity;
            const start = r.start ?? -Infinity;
            return [sec, start];
        };

        const sortedRoutines = [...routineNotes].sort((a, b) => {
            const [as1, as2] = sortKey(a);
            const [bs1, bs2] = sortKey(b);
            return as1 !== bs1 ? as1 - bs1 : as2 - bs2;
        });

        const formatStart = (value: number | undefined): string | null => {
            if (typeof value !== 'number') return null;
            const hh = Math.floor(value / 100);
            const mm = value % 100;
            if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || mm < 0 || mm > 59) return null;
            return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        };

        const buildLine = (r: typeof sortedRoutines[0]): string => {
            const linkName = r.file.basename;
            const startText = formatStart(r.start);
            const prefix = startText ? `${startText} ` : '';
            const suffix = r.estimate ? ` (${r.estimate}m)` : '';
            return `- [ ] ${prefix}[[${linkName}]]${suffix}`;
        };

        const outputLines: string[] = [];
        let currentLabel: string | null | undefined = undefined;

        for (const r of sortedRoutines) {
            const label = this.getRoutineSectionHeading(r.section);
            if (label !== currentLabel) {
                if (label !== null) {
                    outputLines.push(label);
                }
                currentLabel = label;
            }
            outputLines.push(buildLine(r));
        }

        if (srsBatch.length > 0) {
            outputLines.push('');
            outputLines.push(...buildSrsBatchBlock(srsBatch));
        }

        return outputLines;
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- async for consistency with other post-action methods
    private async replenishSrsBatchIfNeeded(editor: Editor, file: TFile): Promise<void> {
        if (!this.settings.srsGrowthEnabled) return;
        const max = this.settings.srsMaxDaily;
        if (max <= 0) return;

        const content = editor.getValue();
        if (!isSrsBatchAllComplete(content)) return;

        const alreadyLinked = collectLinkedBasenames(content);

        const targetDate = resolveMutationReferenceDate(this.parseDailyNoteDate(file), new Date());
        const todayStr = targetDate.toISOString().slice(0, 10);
        const dueRoutines = this.routineEngine.fetchDueRoutines(targetDate);
        const candidates = sortSrsCandidatesByOverdue(
            dueRoutines
                .filter(r => r.isSrs)
                .filter(r => !alreadyLinked.has(r.file.basename))
                .map(r => ({ basename: r.file.basename, next_due: r.next_due, start: r.start, estimate: r.estimate })),
            todayStr
        );

        if (candidates.length === 0) return;

        const batch = candidates.slice(0, max);
        const newLines = batch.map(formatSrsTaskLine);

        const endIdx = content.indexOf(SRS_BATCH_END);
        const endLineIndex = content.slice(0, endIdx).split('\n').length - 1;

        const insertPos = { line: endLineIndex, ch: 0 };
        editor.replaceRange(newLines.join('\n') + '\n', insertPos);

        this.debugLog('SRS batch replenished', {
            file: file.path,
            addedCount: newLines.length,
            remainingCandidates: candidates.length - batch.length,
        });
    }

    async handleInsertRoutine(editor: Editor, view: MarkdownView): Promise<void> {
        if (!this.ensureDailyNoteView(view, 'Insert Routine')) return;

        const targetDate = resolveReferenceDate(this.parseDailyNoteDate(view.file), new Date());
        const outputLines = await this.buildRoutineInsertLines(targetDate);
        if (outputLines.length === 0) {
            this.showLlrNotice('LLR: 今日のルーチンはありません。');
            return;
        }

        // Insert at the end of the document
        const lastLine = editor.lastLine();
        const lastLineText = editor.getLine(lastLine);
        const insertPos = { line: lastLine, ch: lastLineText.length };
        editor.replaceRange('\n' + outputLines.join('\n'), insertPos);

        this.debugLog('Insert Routine', { count: outputLines.length, targetDate: targetDate.toISOString() });
        this.showLlrNotice(`LLR: ${outputLines.length}行のルーチンを追加しました。`);
    }



}
