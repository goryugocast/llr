import { AbstractInputSuggest, App, Editor, EditorPosition, MarkdownView, Notice, Platform, Plugin, PluginSettingTab, Setting, TFile, TFolder, WorkspaceLeaf, moment, normalizePath } from 'obsidian';
import { calculateDuration, findLatestCompletionEndTime } from './service/time-calculator';
import { CheckboxPressIntent, adjustTaskTimeByMinutes, normalizeCompletedTaskActualDuration, transformCheckboxPress, transformTaskLine } from './service/task-transformer';
import { RoutineEngine, type RoutineEngineDebugEvent } from './service/routine-engine';
import { computeStatusBarMetrics, DurationCalculator } from './service/status-bar-calculator';
import { parseRepeatExpression, parseScheduleExpression } from './service/yaml-parser';
import { SummaryView, VIEW_TYPE_SUMMARY } from './view/summary-view';
import { computeSummaryData } from './service/summary-calculator';
import { isDailyNoteMatch, resolveDailyNoteDate, resolveMutationReferenceDate, resolveReferenceDate, type DailyNoteSettings as DailyNoteSettingsSpec } from './service/daily-note-context';

interface LlrSettings {
    debugModeEnabled: boolean;
    estimateWarningEnabled: boolean;
    checkboxOverrideEnabled: boolean;
    mobileLargeCheckboxEnabled: boolean;
    uiLanguage: UILanguage;
    routineFolder: string;
    sectionDefinitions: SectionDefinition[];
}

interface SectionDefinition {
    time: string; // HHmm
    label: string;
}

type UILanguage = 'auto' | 'ja' | 'en';
type ResolvedLanguage = 'ja' | 'en';

interface DebugRecord {
    timestamp: string;
    localTime: string;
    source: 'plugin' | 'routine-engine';
    message: string;
    data?: unknown;
}

const DEFAULT_SETTINGS: LlrSettings = {
    debugModeEnabled: false,
    estimateWarningEnabled: true,
    checkboxOverrideEnabled: true,
    mobileLargeCheckboxEnabled: false,
    uiLanguage: 'auto',
    routineFolder: 'routine',
    sectionDefinitions: [
        { time: '0700', label: '午前' },
        { time: '1200', label: '午後' },
        { time: '1800', label: '夜' },
    ],
};

const TRANSLATIONS = {
    en: {
        'ribbon.openSummary': 'Open LLR Summary',
        'ribbon.adjustTime1m': 'Adjust Time (1m)',
        'command.openSummaryView': 'Open Summary View',
        'command.toggleTask': 'Toggle Task',
        'command.adjustTime1m': 'Adjust Time (1m)',
        'command.fixDurationDriftAll': 'Fix Duration Drift (All Completed Tasks)',
        'command.retroCompleteTask': 'Retro Complete Task',
        'command.startTask': 'Start Task (Force)',
        'command.stopTask': 'Stop Task (Force)',
        'command.startTaskFromPrev': 'Start Task (Align to Previous Completion)',
        'command.interruptTask': 'Interrupt Task',
        'command.resetTaskKeepTime': 'Reset Task (Keep Estimate)',
        'command.duplicateTask': 'Duplicate Task',
        'command.skipTaskLogOnly': 'Skip Task (Log Only)',
        'command.insertRoutine': 'Insert Routine',
        'settings.language.name': 'UI Language',
        'settings.language.desc': 'Choose language for settings and command labels.',
        'settings.language.option.auto': 'Auto (follow system locale)',
        'settings.language.option.ja': 'Japanese',
        'settings.language.option.en': 'English',
        'settings.language.notice': 'LLR: Language updated. Reload plugin to refresh command names.',
        'settings.debugMode.name': 'Debug mode',
        'settings.debugMode.desc': 'Show command/internal delay timestamps in Notice and log them to llrlog/debug.jsonl. Intended for debugging and troubleshooting.',
        'settings.estimateWarning.name': 'Estimate Warning',
        'settings.estimateWarning.desc': 'Show schedule warning cues based on estimated remaining time.',
        'settings.checkboxOverride.name': 'Editor Checkbox Override',
        'settings.checkboxOverride.desc': 'Use LLR short-press/long-press behavior for checkboxes in the editor. When off, checkbox clicks use Obsidian default behavior while commands and hotkeys stay available.',
        'settings.routineFolder.name': 'Routine Folder',
        'settings.routineFolder.desc': 'Folder for repeat-task routine notes. You can pick from suggestions. Only direct child .md files are targeted.',
        'settings.routineSections.heading': 'Routine Sections',
        'settings.routineSections.desc': 'Configure heading boundaries for Insert Routine / template auto-insert. A task goes into the latest section whose HHmm boundary is <= task time. Tasks without section stay at the top (no heading).',
        'settings.routineSections.empty': 'No section definitions. All routines are inserted without headings.',
        'settings.routineSections.itemName': 'Section {index}',
        'settings.routineSections.itemDesc': 'Boundary time (HHmm) and heading label',
        'settings.routineSections.newName': 'New Section',
        'settings.routineSections.newDesc': 'Enter HHmm and heading label. When both are set, it is committed and sorted by time.',
        'settings.routineSections.deleteTooltip': 'Delete section',
        'settings.routineSections.addTooltip': 'Add section (when both fields are filled)',
        'settings.routineSections.labelPlaceholder': 'Morning',
        'settings.routineSections.timePlaceholder': '0700',
        'settings.advanced.heading': 'Advanced / Compatibility',
        'settings.advanced.desc': 'Settings for exceptional cases. Most users can leave these as-is.',
        'notice.invalidTime': 'LLR: Please enter time in HHmm format (example: 0700).',
        'notice.emptySectionLabel': 'LLR: Please enter a section label.',
    },
    ja: {
        'ribbon.openSummary': 'LLR サマリーを開く',
        'ribbon.adjustTime1m': '時間調整（1分）',
        'command.openSummaryView': 'サマリービューを開く',
        'command.toggleTask': 'タスク切り替え',
        'command.adjustTime1m': '時間調整（1分）',
        'command.fixDurationDriftAll': '実績時間のずれを補正（完了タスク全体）',
        'command.retroCompleteTask': '後追いで完了',
        'command.startTask': 'タスク開始（強制）',
        'command.stopTask': 'タスク停止（強制）',
        'command.startTaskFromPrev': 'タスク開始（直前完了に合わせる）',
        'command.interruptTask': 'タスク中断',
        'command.resetTaskKeepTime': 'タスクをリセット（見積維持）',
        'command.duplicateTask': 'タスク複製',
        'command.skipTaskLogOnly': 'タスクをスキップ（ログのみ）',
        'command.insertRoutine': 'ルーチンを挿入',
        'settings.language.name': 'UI言語',
        'settings.language.desc': '設定画面とコマンド名の表示言語を選びます。',
        'settings.language.option.auto': '自動（システム言語）',
        'settings.language.option.ja': '日本語',
        'settings.language.option.en': '英語',
        'settings.language.notice': 'LLR: 言語を更新しました。コマンド名反映のためプラグインを再読み込みしてください。',
        'settings.debugMode.name': 'デバッグモード',
        'settings.debugMode.desc': 'コマンド実行・内部遅延処理の時刻を Notice 表示し、llrlog/debug.jsonl に記録します。デバッグや不具合調査向けです。',
        'settings.estimateWarning.name': '見積警告',
        'settings.estimateWarning.desc': '残り見積り時間に基づく予定警告の表示を切り替えます。',
        'settings.checkboxOverride.name': 'エディタのチェック上書き',
        'settings.checkboxOverride.desc': '編集画面のチェックボックスに LLR の短押し・長押し挙動を使います。OFF にするとクリックは Obsidian 標準に戻り、コマンドとショートカットはそのまま使えます。',
        'settings.routineFolder.name': 'ルーチンフォルダ',
        'settings.routineFolder.desc': 'リピートタスク（ルーチンノート）を置くフォルダ。候補から選択できます。対象はこのフォルダ直下の .md のみです。',
        'settings.routineSections.heading': 'ルーチンセクション',
        'settings.routineSections.desc': 'Insert Routine / テンプレート自動挿入の見出し区切りを設定します。section（HHmm）が各時刻以上になったらその見出しに入ります。未設定のタスクは先頭（見出しなし）です。',
        'settings.routineSections.empty': 'セクション設定がありません。すべて見出しなしで書き出されます。',
        'settings.routineSections.itemName': 'セクション {index}',
        'settings.routineSections.itemDesc': '境界時刻（HHmm）と見出しラベル',
        'settings.routineSections.newName': '新しいセクション',
        'settings.routineSections.newDesc': '時刻（HHmm）と見出しラベルを入力。両方そろうと確定し、時刻順に並び替えます。',
        'settings.routineSections.deleteTooltip': 'セクションを削除',
        'settings.routineSections.addTooltip': 'セクションを追加（両方入力時）',
        'settings.routineSections.labelPlaceholder': '午前',
        'settings.routineSections.timePlaceholder': '0700',
        'settings.advanced.heading': '詳細設定 / 互換性',
        'settings.advanced.desc': '例外的な運用向けの設定です。通常はこのままで構いません。',
        'notice.invalidTime': 'LLR: 時刻は HHmm（例: 0700）で入力してください。',
        'notice.emptySectionLabel': 'LLR: 見出しラベルを入力してください。',
    },
} as const;

type TranslationKey = keyof typeof TRANSLATIONS.en;
const DAILY_ROUTINE_TEMPLATE_MARKERS = [
    '{{llr-today}}',
    '{{llr-routines}}',
    '<!-- llr:insert-routine -->',
] as const;
const LEGACY_SKIP_COMMAND_ID = 'defer-task-to-tomorrow';
const SKIP_COMMAND_ID = 'skip-task-log-only';
const DEFAULT_ROUTINE_FOLDER = 'routine';

function parseSectionTimeToInt(value: string): number | null {
    if (!/^\d{4}$/.test(value)) return null;
    const hh = Number(value.slice(0, 2));
    const mm = Number(value.slice(2, 4));
    if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 100 + mm;
}

function normalizeSectionDefinitions(input: unknown): SectionDefinition[] {
    if (!Array.isArray(input)) return DEFAULT_SETTINGS.sectionDefinitions.map((x) => ({ ...x }));

    const normalized: SectionDefinition[] = [];
    for (const item of input) {
        if (!item || typeof item !== 'object') continue;
        const rawTime = String((item as any).time ?? '').replace(/[^\d]/g, '').slice(0, 4);
        const label = String((item as any).label ?? '').trim();
        if (!label) continue;
        if (parseSectionTimeToInt(rawTime) === null) continue;
        normalized.push({ time: rawTime, label });
    }

    normalized.sort((a, b) => {
        const av = parseSectionTimeToInt(a.time) ?? Number.MAX_SAFE_INTEGER;
        const bv = parseSectionTimeToInt(b.time) ?? Number.MAX_SAFE_INTEGER;
        return av - bv || a.label.localeCompare(b.label, 'ja');
    });

    return normalized;
}

function normalizeRoutineFolder(value: unknown): string {
    const asText = typeof value === 'string' ? value : String(value ?? '');
    const normalizedPath = normalizePath(asText.trim()).replace(/^\/+/, '').replace(/\/+$/, '');
    return normalizedPath || DEFAULT_ROUTINE_FOLDER;
}

export default class LlrPlugin extends Plugin {
    private routineEngine: RoutineEngine;
    private settings: LlrSettings = DEFAULT_SETTINGS;
    private statusBar: HTMLElement;
    private statusBarDebounce: ReturnType<typeof setTimeout> | null = null;
    private readonly checkboxLongPressMsTouch = 450;
    private readonly checkboxLongPressMsDesktop = 900;
    private checkboxLongPressTimer: ReturnType<typeof setTimeout> | null = null;
    private suppressNextCheckboxClick = false;
    private suppressResetTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingCheckboxLineIndex: number | null = null;
    private checkboxPointerDownAtMs: number | null = null;
    private checkboxPointerDownPointerType: string | null = null;
    private checkboxPointerDownLineIndex: number | null = null;
    private scheduleValidationTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private lastScheduleValidationError: Map<string, string> = new Map();
    private metadataChangedTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private routineCompletionSnapshotByFile: Map<string, Map<string, { totalCount: number; completedCount: number }>> = new Map();
    private dailyNoteAutoInsertTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private refreshTimer: ReturnType<typeof setInterval> | null = null;
    private debugFolderEnsured = false;
    private debugWriteQueue: Promise<void> = Promise.resolve();
    private lastDebugNoticeAtMs = 0;
    private readonly debugNoticeThrottleMs = 5000;
    // Keep debug logs outside the routine folder so Base views on routines don't react to debug writes.
    private readonly debugLogDir = 'llrlog';
    private readonly debugLogFileName = 'debug.jsonl';
    private readonly debugLogMaxBytes = 5 * 1024 * 1024;
    private readonly debugLogTrimBytes = 1 * 1024 * 1024;

    async onload() {
        await this.loadSettings();
        this.syncMobileLargeCheckboxClass();
        SummaryView.setRoutineFolder(this.settings.routineFolder);
        this.addSettingTab(new LlrSettingTab(this.app, this));

        this.routineEngine = new RoutineEngine(this.app, {
            routineFolder: this.settings.routineFolder,
            onDebugEvent: (event) => this.handleRoutineEngineDebugEvent(event),
            onNotice: (message, timeout) => this.showLlrNotice(message, timeout),
        });
        this.debugLog('Loading LLR plugin...');

        // Single status bar item for full control over spacing
        this.statusBar = this.addStatusBarItem();
        this.statusBar.setText('');

        this.registerView(
            VIEW_TYPE_SUMMARY,
            (leaf) => new SummaryView(leaf)
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
                    this.scheduleDailyNoteRoutineAutoInsert(file);
                }
            })
        );
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => this.scheduleMetadataChangedProcessing(file))
        );
        // Checkbox override + long-press support
        this.registerDomEvent(document, 'pointerdown', (ev) => this.handlePointerDown(ev));
        this.registerDomEvent(document, 'pointerup', (ev) => this.handlePointerUp(ev));
        this.registerDomEvent(document, 'pointercancel', () => {
            this.clearLongPressTimer();
            this.pendingCheckboxLineIndex = null;
        });
        // Cursor movement tracking (click or key navigation)
        this.registerDomEvent(document, 'click', (ev) => this.handleDocumentClick(ev), true);
        this.registerDomEvent(document, 'beforeinput', (ev) => this.handleDocumentBeforeInput(ev as InputEvent), true);
        this.registerDomEvent(document, 'input', (ev) => this.handleDocumentInput(ev as InputEvent), true);
        this.registerDomEvent(document, 'compositionstart', (ev) => this.handleDocumentCompositionEvent('compositionstart', ev as CompositionEvent), true);
        this.registerDomEvent(document, 'compositionend', (ev) => this.handleDocumentCompositionEvent('compositionend', ev as CompositionEvent), true);
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
            id: 'fix-duration-drift-all',
            name: this.t('command.fixDurationDriftAll'),
            icon: 'wrench',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                void this.runCommandWithDebug('fix-duration-drift-all', this.t('command.fixDurationDriftAll'), async () => {
                    this.debugLog('Command: Fix Duration Drift (All Completed Tasks)');
                    await this.handleFixDurationDriftAll(editor, view);
                });
            }
        });

        this.addCommand({
            id: 'retro-complete-task',
            name: this.t('command.retroCompleteTask'),
            icon: 'stamp',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                void this.runCommandWithDebug('retro-complete-task', this.t('command.retroCompleteTask'), async () => {
                    this.debugLog('Command: Retro Complete Task');
                    await this.handleToggleTask(editor, view, 'retroComplete');
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
            id: 'interrupt-task',
            name: this.t('command.interruptTask'),
            icon: 'pause',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                void this.runCommandWithDebug('interrupt-task', this.t('command.interruptTask'), async () => {
                    this.debugLog('Command: Interrupt Task');
                    await this.handleToggleTask(editor, view, 'interrupt');
                });
            }
        });

        this.addCommand({
            id: 'reset-task-keep-time',
            name: this.t('command.resetTaskKeepTime'),
            icon: 'undo-2',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                void this.runCommandWithDebug('reset-task-keep-time', this.t('command.resetTaskKeepTime'), async () => {
                    this.debugLog('Command: Reset Task (Keep Estimate)');
                    await this.handleResetTaskKeepTime(editor, view);
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
                void this.runCommandWithDebug(SKIP_COMMAND_ID, this.t('command.skipTaskLogOnly'), async () => {
                    this.debugLog('Command: Skip Task (Log Only)');
                    await this.handleDeferTaskToTomorrow(editor, view);
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
        const hotkeyManager = (this.app as any)?.hotkeyManager;
        if (!hotkeyManager || typeof hotkeyManager !== 'object') return;
        if (typeof hotkeyManager.setHotkeys !== 'function' || typeof hotkeyManager.removeHotkeys !== 'function') return;

        const oldCommandId = `${this.manifest.id}:${LEGACY_SKIP_COMMAND_ID}`;
        const newCommandId = `${this.manifest.id}:${SKIP_COMMAND_ID}`;
        const customKeys = hotkeyManager.customKeys as Record<string, unknown> | undefined;
        const oldKeys = customKeys?.[oldCommandId];
        const newKeys = customKeys?.[newCommandId];
        const oldHasKeys = Array.isArray(oldKeys) && oldKeys.length > 0;
        const newHasKeys = Array.isArray(newKeys) && newKeys.length > 0;

        if (oldHasKeys && !newHasKeys) {
            hotkeyManager.setHotkeys(newCommandId, oldKeys);
        }
        if (oldHasKeys || customKeys?.[oldCommandId] != null) {
            hotkeyManager.removeHotkeys(oldCommandId);
        }
        if ((oldHasKeys || customKeys?.[oldCommandId] != null) && typeof hotkeyManager.save === 'function') {
            hotkeyManager.save();
            this.debugLog('Migrated legacy command hotkeys', {
                from: oldCommandId,
                to: newCommandId,
                migratedKeyCount: oldHasKeys ? oldKeys.length : 0,
            });
        }
    }

    private debugLog(message: string, data?: any) {
        const timestamp = new Date().toISOString();
        const logMsg = `[LLR Debug ${timestamp}] ${message}`;
        console.log(logMsg);
        if (data) console.log(data);
        this.emitDebugRecord('plugin', message, data);
    }

    async loadSettings(): Promise<void> {
        const loaded = await this.loadData();
        const merged = { ...DEFAULT_SETTINGS, ...(loaded ?? {}) } as LlrSettings;
        merged.checkboxOverrideEnabled = Boolean((loaded as any)?.checkboxOverrideEnabled ?? merged.checkboxOverrideEnabled);
        merged.mobileLargeCheckboxEnabled = Boolean((loaded as any)?.mobileLargeCheckboxEnabled ?? merged.mobileLargeCheckboxEnabled);
        merged.uiLanguage = ((loaded as any)?.uiLanguage === 'ja' || (loaded as any)?.uiLanguage === 'en')
            ? (loaded as any).uiLanguage
            : 'auto';
        merged.routineFolder = normalizeRoutineFolder((loaded as any)?.routineFolder ?? merged.routineFolder);
        merged.sectionDefinitions = normalizeSectionDefinitions((loaded as any)?.sectionDefinitions ?? merged.sectionDefinitions);
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
        const lang = this.resolveLanguage();
        const template = TRANSLATIONS[lang][key] ?? TRANSLATIONS.en[key];
        if (!vars) return template;
        return Object.entries(vars).reduce(
            (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
            template
        );
    }

    private resolveLanguage(): ResolvedLanguage {
        if (this.settings.uiLanguage === 'ja' || this.settings.uiLanguage === 'en') {
            return this.settings.uiLanguage;
        }
        const locale = String(globalThis.navigator?.language ?? '').toLowerCase();
        return locale.startsWith('ja') ? 'ja' : 'en';
    }

    getRoutineFolder(): string {
        return this.settings.routineFolder;
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
            this.resetCheckboxInteractionState();
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
        SummaryView.setRoutineFolder(normalized);

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
        this.emitDebugRecord(event.source, event.message, event.data);
    }

    private async runCommandWithDebug(commandId: string, commandName: string, fn: () => Promise<void> | void): Promise<void> {
        const startedAt = new Date();
        this.emitDebugRecord('plugin', 'command:start', {
            commandId,
            commandName,
            startedAt: startedAt.toISOString(),
        });

        try {
            await fn();
            this.emitDebugRecord('plugin', 'command:done', {
                commandId,
                commandName,
                finishedAt: new Date().toISOString(),
            });
        } catch (error) {
            this.emitDebugRecord('plugin', 'command:error', {
                commandId,
                commandName,
                finishedAt: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    private emitDebugRecord(source: 'plugin' | 'routine-engine', message: string, data?: unknown, options?: { notice?: boolean }): void {
        if (!this.settings.debugModeEnabled) return;

        const now = new Date();
        const record: DebugRecord = {
            timestamp: now.toISOString(),
            localTime: this.formatDebugLocalTime(now),
            source,
            message,
            ...(data !== undefined ? { data } : {}),
        };

        if (options?.notice !== false) {
            const noticeText = `[Debug ${record.localTime}] ${source} ${message}${this.summarizeDebugData(data)}`;
            this.showDebugNotice(noticeText, 5000);
        }
        void this.appendDebugLog(record);
    }

    showLlrNotice(message: string, timeout = 5000): void {
        if (this.settings.debugModeEnabled) {
            const nowMs = Date.now();
            if (nowMs - this.lastDebugNoticeAtMs < this.debugNoticeThrottleMs) return;
            this.lastDebugNoticeAtMs = nowMs;
        }
        new Notice(message, timeout);
    }

    private showDebugNotice(message: string, timeout = 5000): void {
        this.showLlrNotice(message, timeout);
    }

    private summarizeDebugData(data: unknown): string {
        if (data === undefined) return '';
        try {
            const json = JSON.stringify(data);
            if (!json) return '';
            return json.length > 140 ? ` ${json.slice(0, 140)}...` : ` ${json}`;
        } catch {
            return ' [unserializable-data]';
        }
    }

    private formatDebugLocalTime(date: Date): string {
        const hh = date.getHours().toString().padStart(2, '0');
        const mm = date.getMinutes().toString().padStart(2, '0');
        const ss = date.getSeconds().toString().padStart(2, '0');
        const ms = date.getMilliseconds().toString().padStart(3, '0');
        return `${hh}:${mm}:${ss}.${ms}`;
    }

    private getDebugLogFilePath(): string {
        return normalizePath(`${this.debugLogDir}/${this.debugLogFileName}`);
    }

    private async ensureDebugLogFolder(): Promise<void> {
        if (this.debugFolderEnsured) return;

        const adapter = this.app.vault.adapter;
        const segments = this.debugLogDir.split('/').filter(Boolean);
        let current = '';

        for (const segment of segments) {
            current = current ? `${current}/${segment}` : segment;
            const path = normalizePath(current);
            if (!(await adapter.exists(path))) {
                await adapter.mkdir(path);
            }
        }

        this.debugFolderEnsured = true;
    }

    private async appendDebugLog(record: DebugRecord): Promise<void> {
        this.debugWriteQueue = this.debugWriteQueue.then(async () => {
            try {
                await this.ensureDebugLogFolder();
                const path = this.getDebugLogFilePath();
                await this.trimDebugLogIfNeeded(path);
                await this.app.vault.adapter.append(path, `${JSON.stringify(record)}\n`);
            } catch (error) {
                console.error('[LLR] Failed to write debug log', error);
            }
        });
        await this.debugWriteQueue;
    }

    private async trimDebugLogIfNeeded(path: string): Promise<void> {
        const adapter = this.app.vault.adapter;
        if (!(await adapter.exists(path))) return;

        let currentSize = 0;
        try {
            const stat = await adapter.stat(path);
            currentSize = stat?.size ?? 0;
        } catch {
            return;
        }

        if (currentSize <= this.debugLogMaxBytes) return;

        const content = await adapter.read(path);
        const encoded = new TextEncoder().encode(content);
        if (encoded.length <= this.debugLogTrimBytes) {
            await adapter.write(path, '');
            return;
        }

        // Rough trim: drop oldest ~1MB, then align to next newline.
        let dropAt = this.debugLogTrimBytes;
        while (dropAt < encoded.length && encoded[dropAt] !== 0x0a) {
            dropAt += 1;
        }
        if (dropAt < encoded.length) dropAt += 1;

        const trimmed = new TextDecoder().decode(encoded.slice(dropAt));
        await adapter.write(path, trimmed);
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
            workspace.revealLeaf(leaf);
            // モバイル環境でサイドバーが閉じている場合に確実に開く
            if (Platform.isMobile) {
                (this.app as any).workspace.leftSplit?.collapse?.(); // 左は閉じる（任意）
                (this.app as any).workspace.rightSplit?.expand?.();
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

        this.primeRoutineCompletionSnapshot(view.file);

        const content = view.editor.getValue();
        const lines = content.split('\n');
        const cursorLine = view.editor.getCursor().line;
        const now = new Date();
        const nowTime = this.formatTime(now);

        // 1. Status Bar update
        const { totalMin, remainMin, cursorMin } = computeStatusBarMetrics(
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

    private handlePointerDown(ev: PointerEvent): void {
        if (!this.settings.checkboxOverrideEnabled) return;
        const target = this.getCheckboxAtPoint(ev.clientX, ev.clientY);
        if (!target || !this.isEditableMarkdownView()) return;
        if (ev.button !== 0 || ev.isPrimary === false) return;

        const { checkbox, lineIndex } = target;
        this.pendingCheckboxLineIndex = lineIndex;
        this.checkboxPointerDownAtMs = Date.now();
        this.checkboxPointerDownPointerType = ev.pointerType || 'unknown';
        this.checkboxPointerDownLineIndex = lineIndex;

        this.clearLongPressTimer();
        const isTouchLike = Platform.isMobile || ev.pointerType === 'touch' || ev.pointerType === 'pen';
        const longPressMs = isTouchLike
            ? this.checkboxLongPressMsTouch
            : this.checkboxLongPressMsDesktop;
        this.debugLog('Checkbox pointerdown', {
            pointerType: ev.pointerType || 'unknown',
            button: ev.button,
            isPrimary: ev.isPrimary,
            lineIndex,
            lineState: this.getTaskLineState(this.getLineTextAt(lineIndex)),
            longPressMs,
        });

        this.checkboxLongPressTimer = setTimeout(() => {
            const elapsedMs = this.checkboxPointerDownAtMs ? Date.now() - this.checkboxPointerDownAtMs : null;
            this.debugLog('Checkbox long press timeout fired', {
                pointerType: this.checkboxPointerDownPointerType,
                lineIndex: this.checkboxPointerDownLineIndex,
                elapsedMs,
            });
            this.suppressNextCheckboxClick = true;
            if (this.suppressResetTimer) clearTimeout(this.suppressResetTimer);
            this.suppressResetTimer = setTimeout(() => {
                this.suppressNextCheckboxClick = false;
                this.suppressResetTimer = null;
            }, 800);
            this.triggerHaptic(true);
            void this.handleCheckboxPress('long', checkbox);
        }, longPressMs);
    }

    private handlePointerUp(ev: PointerEvent): void {
        if (!this.settings.checkboxOverrideEnabled) return;
        // Simple cleanup, no coordinate check needed
        const elapsedMs = this.checkboxPointerDownAtMs ? Date.now() - this.checkboxPointerDownAtMs : null;
        if (this.checkboxPointerDownAtMs !== null) {
            this.debugLog('Checkbox pointerup', {
                pointerType: ev.pointerType || 'unknown',
                elapsedMs,
                lineIndex: this.checkboxPointerDownLineIndex,
            });
        }
        this.clearLongPressTimer();
        this.pendingCheckboxLineIndex = null;
        this.checkboxPointerDownAtMs = null;
        this.checkboxPointerDownPointerType = null;
        this.checkboxPointerDownLineIndex = null;
    }

    private handleDocumentClick(ev: MouseEvent): void {
        if (!this.settings.checkboxOverrideEnabled) return;
        // モーダル（設定画面など）の中で発生したクリックには干渉しない
        if (ev.target instanceof Element && ev.target.closest('.modal-container')) return;

        const target = this.getCheckboxAtPoint(ev.clientX, ev.clientY);
        if (!target) {
            this.updateUI();
            return;
        }

        const { checkbox, lineIndex } = target;
        const elapsedSincePointerDownMs = this.checkboxPointerDownAtMs ? Date.now() - this.checkboxPointerDownAtMs : null;

        // Hijack the event
        ev.preventDefault();
        ev.stopImmediatePropagation();
        this.debugLog('Checkbox click intercepted', {
            lineIndex,
            suppressNextCheckboxClick: this.suppressNextCheckboxClick,
            elapsedSincePointerDownMs,
        });

        if (this.suppressNextCheckboxClick) {
            this.suppressNextCheckboxClick = false;
            this.debugLog('Checkbox click suppressed after long press', {
                lineIndex,
                elapsedSincePointerDownMs,
            });
            this.updateUI();
            return;
        }

        this.triggerHaptic(false);
        if (checkbox instanceof HTMLElement && Platform.isMobile) {
            checkbox.blur();
        }

        // Defer to next tick so CM6 finishes click processing before document modification
        setTimeout(() => {
            void this.handleCheckboxPress('short', checkbox, lineIndex);
        }, 0);
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

        this.emitDebugRecord('plugin', `Editor ${phase}`, {
            pointerType: this.checkboxPointerDownPointerType,
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

        this.emitDebugRecord('plugin', `Editor ${phase}`, {
            pointerType: this.checkboxPointerDownPointerType,
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

    /**
     * 指定された座標にあるチェックボックスとその行番号を特定する
     */
    private getCheckboxAtPoint(x: number, y: number): { checkbox: HTMLElement; lineIndex: number } | null {
        const element = document.elementFromPoint(x, y);
        const checkbox = this.getCheckboxElement(element, x, y);
        if (!checkbox) return null;

        const padding = Platform.isMobile ? 6 : 3;
        if (!this.isCoordInsideElement(x, y, checkbox, padding)) return null;

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.editor) return null;

        // チェックボックスが現在のアクティブなエディタのDOM階層内にあるか確認
        // これにより設定画面・サイドバー・モーダル上の要素を完全に除外する
        if (!view.contentEl.contains(checkbox)) return null;

        const lineIndex = this.resolveLineIndex(view.editor, checkbox, { x, y });
        if (lineIndex === null) return null;

        return { checkbox, lineIndex };
    }

    private isCoordInsideElement(x: number, y: number, el: HTMLElement, padding = 0): boolean {
        const rect = el.getBoundingClientRect();
        return (
            x >= rect.left - padding &&
            x <= rect.right + padding &&
            y >= rect.top - padding &&
            y <= rect.bottom + padding
        );
    }

    private clearLongPressTimer(): void {
        if (!this.checkboxLongPressTimer) return;
        clearTimeout(this.checkboxLongPressTimer);
        this.checkboxLongPressTimer = null;
    }

    private resetCheckboxInteractionState(): void {
        this.clearLongPressTimer();
        if (this.suppressResetTimer) {
            clearTimeout(this.suppressResetTimer);
            this.suppressResetTimer = null;
        }
        this.suppressNextCheckboxClick = false;
        this.pendingCheckboxLineIndex = null;
        this.checkboxPointerDownAtMs = null;
        this.checkboxPointerDownPointerType = null;
        this.checkboxPointerDownLineIndex = null;
    }

    private getCheckboxElement(target: EventTarget | null, x?: number, y?: number): HTMLElement | null {
        if (!(target instanceof Element)) return null;

        // 1. 直接的なヒット（エディタ内に限定）
        const direct = target.closest('.markdown-source-view .task-list-item-checkbox, .markdown-source-view input[type="checkbox"]');
        if (direct instanceof HTMLElement) return direct;

        // 2. 行内フォールバックは、チェックボックス近傍だけに限定する
        const line = target.closest('.HyperMD-task-line, .cm-line, .task-list-item');
        if (line instanceof HTMLElement) {
            const nested = line.querySelector('.task-list-item-checkbox, input[type="checkbox"]');
            if (nested instanceof HTMLElement && typeof x === 'number' && typeof y === 'number') {
                const fallbackPadding = Platform.isMobile ? 6 : 3;
                if (this.isCoordInsideElement(x, y, nested, fallbackPadding)) {
                    return nested;
                }
            }
        }

        return null;
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
        checkboxEl: HTMLElement,
        preResolvedLineIndex?: number
    ): Promise<void> {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file || !view.editor) return;

        const editor = view.editor;
        const lineIndex = preResolvedLineIndex
            ?? this.pendingCheckboxLineIndex
            ?? this.resolveLineIndex(editor, checkboxEl);
        this.pendingCheckboxLineIndex = null;

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

        await this.applyTaskResult(editor, view, targetLine, lineText, result);
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

        const fallback = this.formatTime(now);
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

        return findLatestCompletionEndTime(lines, this.formatTime(new Date()));
    }

    private resolveLineIndex(
        editor: Editor,
        checkboxEl: HTMLElement,
        pointer?: { x: number; y: number }
    ): number | null {
        // Strategy 1: Data Attribute (Most reliable when available)
        const dataLine = checkboxEl.closest('.cm-line, [data-line]')?.getAttribute('data-line');
        if (dataLine) {
            const parsed = parseInt(dataLine, 10);
            if (!isNaN(parsed) && parsed >= 0) return parsed;
        }

        // Strategy 2: CodeMirror 6 API
        const cmView = this.getCM6View(editor);
        const offsetToPos = (editor as any)?.offsetToPos;

        if (cmView && typeof offsetToPos === 'function') {
            // a) Coordinate-based
            if (pointer && typeof cmView.posAtCoords === 'function') {
                try {
                    const offset = cmView.posAtCoords({ x: pointer.x, y: pointer.y });
                    if (offset !== null) {
                        const pos = offsetToPos.call(editor, offset);
                        if (pos && typeof pos.line === 'number') return pos.line;
                    }
                } catch (e) {
                    this.debugLog('CM6 posAtCoords failed', e);
                }
            }
            // b) Element-based
            if (typeof cmView.posAtDOM === 'function') {
                try {
                    const offset = cmView.posAtDOM(checkboxEl, 0);
                    const pos = offsetToPos.call(editor, offset);
                    if (pos && typeof pos.line === 'number') return pos.line;
                } catch (e) {
                    this.debugLog('CM6 posAtDOM failed', e);
                }
            }
        }

        // Strategy 3: Visual Proximity (Force fallback for widgets in mobile)
        if (pointer) {
            return this.resolveLineByProximity(checkboxEl, pointer.y);
        }

        return null;
    }

    private resolveLineByProximity(el: HTMLElement, y: number): number | null {
        const container = el.closest('.cm-content, .markdown-source-view');
        if (!container) return null;

        const lines = container.querySelectorAll('.cm-line, [data-line]');
        let bestLine: number | null = null;
        let minDist = Infinity;

        for (let i = 0; i < lines.length; i++) {
            const rect = lines[i].getBoundingClientRect();
            if (y >= rect.top - 2 && y <= rect.bottom + 2) {
                const dl = lines[i].getAttribute('data-line');
                if (dl) return parseInt(dl, 10);
            }
            const dist = Math.abs(y - (rect.top + rect.bottom) / 2);
            if (dist < minDist) {
                minDist = dist;
                const dl = lines[i].getAttribute('data-line');
                if (dl) bestLine = parseInt(dl, 10);
            }
        }
        return minDist < 20 ? bestLine : null;
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
            (basename, format) => this.parseDailyNoteBasename(basename, format)
        );
    }

    private parseDailyNoteDate(file: TFile): Date | null {
        return resolveDailyNoteDate(
            file,
            this.getDailyNoteSettings(),
            (basename, format) => this.parseDailyNoteBasename(basename, format)
        );
    }

    private getDailyNoteSettings(): DailyNoteSettingsSpec {
        const dailyNotesPlugin = (this.app as any).internalPlugins?.getPluginById?.('daily-notes');
        const options = dailyNotesPlugin?.instance?.options ?? {};
        return {
            enabled: !!dailyNotesPlugin?.enabled,
            format: String(options.format || 'YYYY-MM-DD'),
            folder: String(options.folder || ''),
        };
    }

    private parseDailyNoteBasename(basename: string, format: string): Date | null {
        const parsed = moment(basename, format, true);
        return parsed.isValid() ? parsed.toDate() : null;
    }

    private primeRoutineCompletionSnapshot(file: TFile): void {
        if (!this.isDailyNoteFile(file)) return;
        if (this.routineCompletionSnapshotByFile.has(file.path)) return;

        const snapshot = this.buildRoutineCompletionSnapshot(file);
        if (!snapshot) return;

        this.routineCompletionSnapshotByFile.set(file.path, snapshot);
    }

    private buildRoutineCompletionSnapshot(file: TFile): Map<string, { totalCount: number; completedCount: number }> | null {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache || !cache.listItems) {
            return null;
        }

        const currentSnapshot = new Map<string, { totalCount: number; completedCount: number }>();
        const listItems = [...cache.listItems]
            .filter((item) => typeof item.task === 'string')
            .sort((a, b) =>
                a.position.start.offset - b.position.start.offset ||
                a.position.end.offset - b.position.end.offset
            );
        const links = [...(cache.links ?? [])].sort((a, b) =>
            a.position.start.offset - b.position.start.offset ||
            a.position.end.offset - b.position.end.offset
        );

        if (listItems.length === 0 || links.length === 0) {
            return currentSnapshot;
        }

        let linkCursor = 0;
        const resolvedRoutineCache = new Map<string, TFile | null>();

        for (const item of listItems) {
            const start = item.position.start.offset;
            const end = item.position.end.offset;

            while (linkCursor < links.length && links[linkCursor].position.end.offset < start) {
                linkCursor++;
            }

            let scanIndex = linkCursor;
            const seenRoutinePathsInItem = new Set<string>();

            for (; scanIndex < links.length; scanIndex++) {
                const link = links[scanIndex];
                const linkStart = link.position.start.offset;
                const linkEnd = link.position.end.offset;

                if (linkStart > end) break;
                if (linkStart < start || linkEnd > end) continue;

                let routineFile = resolvedRoutineCache.get(link.link);
                if (routineFile === undefined) {
                    routineFile = this.routineEngine.resolveRoutineFile(link.link, file.path);
                    resolvedRoutineCache.set(link.link, routineFile);
                }
                if (!routineFile) continue;
                if (seenRoutinePathsInItem.has(routineFile.path)) continue;
                seenRoutinePathsInItem.add(routineFile.path);

                const isComplete = item.task === 'x';
                const prevCounts = currentSnapshot.get(routineFile.path) ?? { totalCount: 0, completedCount: 0 };
                currentSnapshot.set(routineFile.path, {
                    totalCount: prevCounts.totalCount + 1,
                    completedCount: prevCounts.completedCount + (isComplete ? 1 : 0),
                });
            }
        }

        return currentSnapshot;
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

    private scheduleDailyNoteRoutineAutoInsert(file: TFile, attempt = 0): void {
        if (!this.isDailyNoteFile(file)) return;
        if (attempt > 12) {
            this.dailyNoteAutoInsertTimers.delete(file.path);
            return;
        }

        const existing = this.dailyNoteAutoInsertTimers.get(file.path);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
            void this.tryAutoInsertRoutinesFromTemplateMarker(file, attempt);
        }, attempt === 0 ? 200 : 500);

        this.dailyNoteAutoInsertTimers.set(file.path, timer);
    }

    private async tryAutoInsertRoutinesFromTemplateMarker(file: TFile, attempt: number): Promise<void> {
        try {
            if (!this.isDailyNoteFile(file)) return;

            const content = await this.app.vault.read(file);
            const hasMarker = DAILY_ROUTINE_TEMPLATE_MARKERS.some((marker) => content.includes(marker));
            if (!hasMarker) {
                // Templater may populate the content after create; retry for a short window.
                this.scheduleDailyNoteRoutineAutoInsert(file, attempt + 1);
                return;
            }

            const targetDate = this.parseDailyNoteDate(file) ?? new Date();
            const outputLines = await this.buildRoutineInsertLines(targetDate);
            const block = outputLines.join('\n');

            let replaced = content;
            for (const marker of DAILY_ROUTINE_TEMPLATE_MARKERS) {
                if (!replaced.includes(marker)) continue;
                replaced = replaced.split(marker).join(block);
            }

            if (replaced !== content) {
                await this.app.vault.modify(file, replaced);
                this.debugLog('Daily template marker expanded to routines', {
                    file: file.path,
                    date: targetDate.toISOString(),
                    lineCount: outputLines.length,
                    attempt,
                });
            }
        } catch (error) {
            this.debugLog('Daily template routine auto-insert failed', {
                file: file.path,
                attempt,
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            this.dailyNoteAutoInsertTimers.delete(file.path);
        }
    }

    private getCM6View(editor: Editor): any {
        const raw = editor as any;
        return raw.cm?.cm ?? raw.cm ?? raw.cmEditor ?? raw.editor?.cm?.cm?.view ?? raw.editor?.cm ?? null;
    }

    private triggerHaptic(isLongPress: boolean): void {
        // iOS WebView may ignore this API. Use best-effort without failing behavior.
        const vibrate = window.navigator?.vibrate?.bind(window.navigator);
        if (!vibrate) return;
        if (!Platform.isMobile) return;

        if (isLongPress) {
            vibrate([20, 60, 20]);
            return;
        }
        vibrate(20);
    }

    onunload() {
        console.log('Unloading Llr Plugin...');
        document.body.classList.remove('llr-mobile-large-checkbox');
        if (this.statusBarDebounce) clearTimeout(this.statusBarDebounce);
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        this.resetCheckboxInteractionState();
        for (const timer of this.scheduleValidationTimers.values()) {
            clearTimeout(timer);
        }
        for (const timer of this.dailyNoteAutoInsertTimers.values()) {
            clearTimeout(timer);
        }
        for (const timer of this.metadataChangedTimers.values()) {
            clearTimeout(timer);
        }
        this.dailyNoteAutoInsertTimers.clear();
        this.metadataChangedTimers.clear();
        this.scheduleValidationTimers.clear();
        this.lastScheduleValidationError.clear();
        this.routineCompletionSnapshotByFile.clear();
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
            this.routineCompletionSnapshotByFile.delete(file.path);
            return;
        }

        const currentSnapshot = this.buildRoutineCompletionSnapshot(file);
        if (!currentSnapshot) {
            this.routineCompletionSnapshotByFile.delete(file.path);
            return;
        }

        const previousSnapshot = this.routineCompletionSnapshotByFile.get(file.path);
        this.routineCompletionSnapshotByFile.set(file.path, currentSnapshot);

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
            const current = currentSnapshot.get(routinePath) ?? { totalCount: 0, completedCount: 0 };
            const prev = previousSnapshot.get(routinePath) ?? { totalCount: 0, completedCount: 0 };

            if (prev.completedCount === current.completedCount) {
                continue;
            }

            const routineFile = this.app.vault.getAbstractFileByPath(routinePath);
            if (!(routineFile instanceof TFile)) continue;

            const completionDelta = current.completedCount - prev.completedCount;
            const completionBaseDate = resolveMutationReferenceDate(this.parseDailyNoteDate(file), new Date());
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
            });

            // Trigger engine only when the count of completed items changes.
            this.routineEngine.scheduleUpdate(
                routineFile,
                file.path,
                completionDelta > 0 ? completionBaseDate : null
            );
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

        await this.applyTaskResult(editor, view, cursor.line, lineText, result);
        const driftFixCount = this.fixDurationDriftAcrossEditor(editor);
        if (driftFixCount > 0) {
            this.debugLog('Auto fixed duration drift after toggle', { driftFixCount });
        }
    }

    private resolveDefaultToggleDelegatedAction(lineText: string): 'taskify' | 'complete' | 'duplicate' | undefined {
        const trimmed = lineText.trim();
        if (!trimmed) return undefined;
        if (!/^- \[( |\/|x)\]/.test(trimmed)) return 'taskify';
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
        const fallback = this.formatTime(now);
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
        await this.applyTaskResult(editor, view, cursor.line, lineText, result);
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
    }

    async handleFixDurationDriftAll(editor: Editor, view: MarkdownView): Promise<void> {
        if (!this.ensureDailyNoteView(view, 'Fix Duration Drift (All Completed Tasks)')) return;

        const changedCount = this.fixDurationDriftAcrossEditor(editor);

        this.debugLog('Fix duration drift (all) done', { changedCount });
        this.showLlrNotice(`LLR: 実績時間のズレを ${changedCount} 行修正しました。`);
    }

    private fixDurationDriftAcrossEditor(editor: Editor): number {
        let changedCount = 0;
        const lastLine = editor.lastLine();
        for (let line = 0; line <= lastLine; line++) {
            const current = editor.getLine(line);
            const normalized = normalizeCompletedTaskActualDuration(current);
            if (!normalized || normalized === current) continue;
            editor.replaceRange(normalized, { line, ch: 0 }, { line, ch: current.length });
            changedCount++;
        }
        return changedCount;
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

    private async applyTaskResult(
        editor: Editor,
        view: MarkdownView,
        lineIndex: number,
        lineText: string,
        result: { type: 'update' | 'insert' | 'complete' | 'interrupt' | 'none'; content: string; extraContent?: string }
    ): Promise<void> {
        switch (result.type) {
            case 'update':
                editor.replaceRange(result.content, { line: lineIndex, ch: 0 }, { line: lineIndex, ch: lineText.length });
                editor.setCursor(lineIndex, result.content.length);
                this.debugLog('Task updated', { content: result.content });
                // No manual call needed here anymore, onMetadataChanged will catch it
                break;
            case 'insert':
                editor.replaceRange('\n' + result.content, { line: lineIndex, ch: lineText.length });
                editor.setCursor(lineIndex + 1, result.content.length);
                this.debugLog('New task inserted', { content: result.content });
                break;
            case 'complete':
                this.debugLog('Action: Complete (via transformer signal)');
                await this.completeTask(editor, view, lineIndex, lineText);
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

    async completeTask(editor: Editor, view: MarkdownView, lineIndex: number, lineText: string) {
        const now = new Date();
        const endTimeStr = this.formatTime(now);

        // Regex to find start time: - [/] HH:mm ...
        const match = lineText.match(/- \[\/\]\s*(\d{2}:\d{2})/);
        if (!match) {
            this.debugLog('Complete failed: No start time found in line', { lineText });
            this.showLlrNotice('LLR: Start time not found.');
            return;
        }
        const startTimeStr = match[1];
        const duration = calculateDuration(startTimeStr, endTimeStr);

        this.debugLog('Completing Task...', {
            lineIndex,
            lineText,
            startTimeStr,
            endTimeStr,
            duration
        });

        // ALLタイムスタンプ、ダッシュ、経過時間（括弧）等のゴミを根こそぎ消す正規表現
        const cleanupRegex = /(\d{2}:\d{2}\s*(-|>)?\s*|\(\d+m( > \d+m)?\)\s*)+/g;
        let content = lineText.replace(/^- \[\/\]\s*\d{2}:\d{2}(?:\s*-\s*)?/, '').trim();
        content = content.replace(cleanupRegex, '').trim();

        // オリジナルのテキストから、変更前の「見積もり」を抽出（XXm > YYm の形式も考慮）
        const estimateMatch = lineText.match(/\(([^)]+)m\)/);
        let timeInfo = `(${duration}m)`;

        if (estimateMatch) {
            // (30m > 45m) のような場合、最初の 30 を見積もりとして採用
            const estimate = estimateMatch[1].split('>')[0].trim();
            if (estimate !== duration.toString()) {
                timeInfo = `(${estimate}m > ${duration}m)`;
            }
        }

        const indentMatch = lineText.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '';
        const taskSuffix = content.trim();
        const newLine = `${indent}- [x] ${startTimeStr} - ${endTimeStr} ${timeInfo}${taskSuffix ? ` ${taskSuffix}` : ''}`;

        // setLine よりも replaceRange の方が Live Preview のウィジェット更新がかかりやすい
        editor.replaceRange(newLine, { line: lineIndex, ch: 0 }, { line: lineIndex, ch: lineText.length });
        editor.setCursor(lineIndex, newLine.length);

        // Force CM6 widget re-render (needed when triggered from click handler)
        requestAnimationFrame(() => {
            const cmView = this.getCM6View(editor);
            if (cmView && typeof cmView.dispatch === 'function') {
                cmView.dispatch({});
            }
        });
        this.debugLog('completeTask result:', { newLine });

        // No manual call needed here anymore, onMetadataChanged will catch it
    }


    private async buildRoutineInsertLines(targetDate: Date): Promise<string[]> {
        const dueRoutines = await this.routineEngine.fetchDueRoutines(targetDate);

        if (dueRoutines.length === 0) {
            return [];
        }

        // Sort priority: section (asc) > start (asc)
        // Records with no section come first (treated as -Infinity)
        const sortKey = (r: typeof dueRoutines[0]): [number, number] => {
            const sec = r.section ?? -Infinity;
            const start = r.start ?? -Infinity;
            return [sec, start];
        };

        const sorted = [...dueRoutines].sort((a, b) => {
            const [as1, as2] = sortKey(a);
            const [bs1, bs2] = sortKey(b);
            return as1 !== bs1 ? as1 - bs1 : as2 - bs2;
        });

        // Helper: build a single task line string
        const formatStart = (value: number | undefined): string | null => {
            if (typeof value !== 'number') return null;
            const hh = Math.floor(value / 100);
            const mm = value % 100;
            if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || mm < 0 || mm > 59) {
                return null;
            }
            return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        };

        const buildLine = (r: typeof sorted[0]): string => {
            const linkName = r.file.basename;
            const startText = formatStart(r.start);
            const prefix = startText ? `${startText} ` : '';
            const suffix = r.estimate ? ` (${r.estimate}m)` : '';
            return `- [ ] ${prefix}[[${linkName}]]${suffix}`;
        };

        // Build grouped output
        const outputLines: string[] = [];
        let currentLabel: string | null | undefined = undefined; // undefined = not yet started

        for (const r of sorted) {
            const label = this.getRoutineSectionHeading(r.section);
            if (label !== currentLabel) {
                // Emit heading only if transitioning to a new named section
                if (label !== null) {
                    outputLines.push(label);
                }
                currentLabel = label;
            }
            outputLines.push(buildLine(r));
        }

        return outputLines;
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



    formatTime(date: Date): string {
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    }
}

class FolderPathSuggest extends AbstractInputSuggest<TFolder> {
    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
    }

    protected getSuggestions(query: string): TFolder[] {
        const normalizedQuery = query.trim().toLowerCase();
        const folders = this.app.vault.getAllLoadedFiles()
            .filter((file): file is TFolder => file instanceof TFolder)
            .filter((folder) => folder.path.length > 0)
            .sort((a, b) => a.path.localeCompare(b.path, 'ja'));

        if (!normalizedQuery) return folders.slice(0, 100);
        return folders
            .filter((folder) => folder.path.toLowerCase().includes(normalizedQuery))
            .slice(0, 100);
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.setText(folder.path);
    }

    selectSuggestion(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
        this.setValue(folder.path);
    }

    getFirstSuggestion(query: string): TFolder | null {
        const suggestions = this.getSuggestions(query);
        if (!Array.isArray(suggestions) || suggestions.length === 0) return null;
        return suggestions[0];
    }
}

class LlrSettingTab extends PluginSettingTab {
    plugin: LlrPlugin;
    private routineFolderDraft = '';
    private newSectionDraftTime = '';
    private newSectionDraftLabel = '';

    constructor(app: App, plugin: LlrPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        this.routineFolderDraft = this.plugin.getRoutineFolder();

        new Setting(containerEl)
            .setName(this.plugin.t('settings.language.name'))
            .setDesc(this.plugin.t('settings.language.desc'))
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('auto', this.plugin.t('settings.language.option.auto'))
                    .addOption('ja', this.plugin.t('settings.language.option.ja'))
                    .addOption('en', this.plugin.t('settings.language.option.en'))
                    .setValue(this.plugin.getUiLanguage())
                    .onChange(async (value) => {
                        if (value !== 'auto' && value !== 'ja' && value !== 'en') return;
                        await this.plugin.setUiLanguage(value);
                        this.display();
                        this.plugin.showLlrNotice(this.plugin.t('settings.language.notice'));
                    });
            });

        new Setting(containerEl)
            .setName(this.plugin.t('settings.estimateWarning.name'))
            .setDesc(this.plugin.t('settings.estimateWarning.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.isEstimateWarningEnabled())
                .onChange(async (value) => {
                    await this.plugin.setEstimateWarningEnabled(value);
                }));

        const commitRoutineFolder = async (nextFolder?: string) => {
            if (typeof nextFolder === 'string') {
                this.routineFolderDraft = nextFolder;
            }
            const before = this.plugin.getRoutineFolder();
            await this.plugin.setRoutineFolder(this.routineFolderDraft);
            const after = this.plugin.getRoutineFolder();
            this.routineFolderDraft = after;
            if (after !== before) {
                this.display();
            }
        };

        new Setting(containerEl)
            .setName(this.plugin.t('settings.routineFolder.name'))
            .setDesc(this.plugin.t('settings.routineFolder.desc'))
            .addSearch((search) => {
                search.setPlaceholder(DEFAULT_ROUTINE_FOLDER).setValue(this.routineFolderDraft);
                const folderSuggest = new FolderPathSuggest(this.app, search.inputEl);
                const resolveCommittedFolderPath = (): string | null => {
                    const query = search.getValue().trim();
                    const normalized = normalizeRoutineFolder(query);
                    const exact = this.app.vault.getFolderByPath(normalized);
                    if (exact) return exact.path;
                    if (!query) return this.plugin.getRoutineFolder();
                    const first = folderSuggest.getFirstSuggestion(query);
                    if (!first) return null;
                    const q = query.toLowerCase();
                    if (!first.path.toLowerCase().startsWith(q)) return null;
                    return first.path;
                };
                folderSuggest.onSelect((folder) => {
                    this.routineFolderDraft = folder.path;
                    search.setValue(folder.path);
                    void commitRoutineFolder();
                });
                search.onChange((value) => {
                    this.routineFolderDraft = value;
                });
                search.inputEl.addEventListener('keydown', (ev) => {
                    if (ev.isComposing || ev.key !== 'Enter') return;
                    ev.preventDefault();
                    const resolved = resolveCommittedFolderPath();
                    if (!resolved) return;
                    this.routineFolderDraft = resolved;
                    search.setValue(resolved);
                    folderSuggest.close();
                    void commitRoutineFolder();
                });
                search.inputEl.addEventListener('blur', () => {
                    const resolved = resolveCommittedFolderPath();
                    if (!resolved) {
                        search.setValue(this.plugin.getRoutineFolder());
                        this.routineFolderDraft = this.plugin.getRoutineFolder();
                        return;
                    }
                    this.routineFolderDraft = resolved;
                    search.setValue(resolved);
                    void commitRoutineFolder();
                });
            });

        containerEl.createEl('h3', { text: this.plugin.t('settings.routineSections.heading') });
        containerEl.createEl('p', {
            text: this.plugin.t('settings.routineSections.desc'),
            cls: 'setting-item-description',
        });

        const listContainer = containerEl.createDiv('llr-section-settings-list');
        this.renderSectionDefinitionSettings(listContainer);

        this.renderNewSectionDraftSetting(containerEl);
        this.renderAdvancedSettings(containerEl);
    }

    private renderSectionDefinitionSettings(containerEl: HTMLElement): void {
        containerEl.empty();
        const defs = this.plugin.getSectionDefinitions();

        if (defs.length === 0) {
            containerEl.createEl('p', {
                text: this.plugin.t('settings.routineSections.empty'),
                cls: 'setting-item-description',
            });
            return;
        }

        defs.forEach((def, index) => {
            const saveTimeField = async () => {
                if (defs[index].time.length !== 4 || parseSectionTimeToInt(defs[index].time) === null) {
                    this.plugin.showLlrNotice(this.plugin.t('notice.invalidTime'));
                    this.display();
                    return;
                }
                await this.plugin.setSectionDefinitions(defs);
                this.display();
            };

            const saveLabelField = async () => {
                defs[index].label = defs[index].label.trim();
                if (!defs[index].label) {
                    this.plugin.showLlrNotice(this.plugin.t('notice.emptySectionLabel'));
                    this.display();
                    return;
                }
                await this.plugin.setSectionDefinitions(defs);
                this.display();
            };

            new Setting(containerEl)
                .setName(this.plugin.t('settings.routineSections.itemName', { index: index + 1 }))
                .setDesc(this.plugin.t('settings.routineSections.itemDesc'))
                .addText((text) => {
                    text.setPlaceholder(this.plugin.t('settings.routineSections.labelPlaceholder')).setValue(def.label);
                    text.onChange((value) => {
                        defs[index].label = value;
                    });
                    text.inputEl.addEventListener('blur', () => { void saveLabelField(); });
                    text.inputEl.addEventListener('keydown', (ev) => {
                        if (ev.key !== 'Enter') return;
                        ev.preventDefault();
                        void saveLabelField();
                    });
                })
                .addText((text) => {
                    text.setPlaceholder(this.plugin.t('settings.routineSections.timePlaceholder')).setValue(def.time);
                    text.inputEl.inputMode = 'numeric';
                    text.inputEl.maxLength = 4;
                    text.onChange((value) => {
                        defs[index].time = value.replace(/[^\d]/g, '').slice(0, 4);
                    });
                    text.inputEl.addEventListener('blur', () => { void saveTimeField(); });
                    text.inputEl.addEventListener('keydown', (ev) => {
                        if (ev.key !== 'Enter') return;
                        ev.preventDefault();
                        void saveTimeField();
                    });
                })
                .addExtraButton((btn) => btn
                    .setIcon('trash')
                    .setTooltip(this.plugin.t('settings.routineSections.deleteTooltip'))
                    .onClick(async () => {
                        defs.splice(index, 1);
                        await this.plugin.setSectionDefinitions(defs);
                        this.display();
                    }));
        });
    }

    private renderNewSectionDraftSetting(containerEl: HTMLElement): void {
        const maybeCommitDraft = async () => {
            const time = this.newSectionDraftTime.trim();
            const label = this.newSectionDraftLabel.trim();
            if (!time && !label) return;
            if (!time || !label) return;
            if (time.length !== 4 || parseSectionTimeToInt(time) === null) {
                this.plugin.showLlrNotice(this.plugin.t('notice.invalidTime'));
                return;
            }

            const defs = this.plugin.getSectionDefinitions();
            defs.push({ time, label });
            await this.plugin.setSectionDefinitions(defs);
            this.newSectionDraftTime = '';
            this.newSectionDraftLabel = '';
            this.display();
        };

        new Setting(containerEl)
            .setName(this.plugin.t('settings.routineSections.newName'))
            .setDesc(this.plugin.t('settings.routineSections.newDesc'))
            .addText((text) => {
                text.setPlaceholder(this.plugin.t('settings.routineSections.labelPlaceholder')).setValue(this.newSectionDraftLabel);
                text.onChange((value) => {
                    this.newSectionDraftLabel = value;
                });
                text.inputEl.addEventListener('blur', () => { void maybeCommitDraft(); });
                text.inputEl.addEventListener('keydown', (ev) => {
                    if (ev.key !== 'Enter') return;
                    ev.preventDefault();
                    void maybeCommitDraft();
                });
            })
            .addText((text) => {
                text.setPlaceholder(this.plugin.t('settings.routineSections.timePlaceholder')).setValue(this.newSectionDraftTime);
                text.inputEl.inputMode = 'numeric';
                text.inputEl.maxLength = 4;
                text.onChange((value) => {
                    this.newSectionDraftTime = value.replace(/[^\d]/g, '').slice(0, 4);
                });
                text.inputEl.addEventListener('blur', () => { void maybeCommitDraft(); });
                text.inputEl.addEventListener('keydown', (ev) => {
                    if (ev.key !== 'Enter') return;
                    ev.preventDefault();
                    void maybeCommitDraft();
                });
            })
            .addExtraButton((btn) => btn
                .setIcon('plus')
                .setTooltip(this.plugin.t('settings.routineSections.addTooltip'))
                .onClick(() => { void maybeCommitDraft(); }));
    }

    private renderAdvancedSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: this.plugin.t('settings.advanced.heading') });
        containerEl.createEl('p', {
            text: this.plugin.t('settings.advanced.desc'),
            cls: 'setting-item-description',
        });

        new Setting(containerEl)
            .setName(this.plugin.t('settings.debugMode.name'))
            .setDesc(this.plugin.t('settings.debugMode.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.isDebugModeEnabled())
                .onChange(async (value) => {
                    await this.plugin.setDebugModeEnabled(value);
                }));

        new Setting(containerEl)
            .setName(this.plugin.t('settings.checkboxOverride.name'))
            .setDesc(this.plugin.t('settings.checkboxOverride.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.isCheckboxOverrideEnabled())
                .onChange(async (value) => {
                    await this.plugin.setCheckboxOverrideEnabled(value);
                }));
    }
}
