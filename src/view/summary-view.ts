import { ItemView, WorkspaceLeaf, MarkdownView, TFile, Notice, moment, setIcon } from 'obsidian';
import { SummaryItem, SummaryPresentation, SummaryRenderGroup, buildSummaryPresentation, computeSummaryData } from '../service/summary-calculator';
import { calculateDuration } from '../service/time-calculator';

export const VIEW_TYPE_SUMMARY = 'llr-summary-view';

export class SummaryView extends ItemView {
    private static readonly AUTO_SCROLL_TOP_MARGIN_PX = 18;
    private static readonly AUTO_SCROLL_BOTTOM_MARGIN_PX = 12;
    private static readonly AUTO_SCROLL_STRONG_REAPPLY_MS = 300;
    private static readonly AUTO_SCROLL_REQUEST_MS = 1500;
    private static readonly AUTO_SCROLL_USER_SUPPRESS_MS = 15000;
    private static readonly AUTO_SCROLL_IGNORE_EVENT_MS = 180;
    private static routineFolder = 'routine';

    private currentDate: moment.Moment;
    private targetFile: TFile | null = null;
    private expandedLines: Set<number> = new Set();
    private isRefreshing = false;
    private refreshQueued = false;
    private debouncedRefresh: ReturnType<typeof setTimeout> | null = null;
    private routineSummaryRoleCache: Map<string, string | null> = new Map();
    private autoScrollToRunningUntilMs = 0;
    private manualScrollSuppressedUntilMs = 0;
    private ignoreScrollEventsUntilMs = 0;
    private lastRunningItemKey: string | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.currentDate = moment();
    }

    getViewType() {
        return VIEW_TYPE_SUMMARY;
    }

    getDisplayText() {
        return 'Summary';
    }

    getIcon() {
        return 'list-checks';
    }

    static setRoutineFolder(folder: string): void {
        const normalized = folder.trim().replace(/^\/+/, '').replace(/\/+$/, '');
        SummaryView.routineFolder = normalized || 'routine';
    }

    onOpen() {
        const container = this.contentEl;
        container.empty();
        container.addClass('llr-summary-container');

        this.app.workspace.onLayoutReady(() => {
            this.updateTargetFile();
            this.requestAutoScrollToRunning();
            void this.requestRefresh();
        });

        // ファイル内容の変更を監視：1秒のデバウンスを導入
        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            if (this.targetFile && file.path === this.targetFile.path) {
                this.scheduleRefresh();
            }
        }));

        // アクティブなビューの切り替えを監視
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            const targetChanged = this.updateTargetFile();
            if (targetChanged) {
                this.requestAutoScrollToRunning();
                void this.requestRefresh();
                return;
            }

            if (this.isViewingTargetDailyNote()) {
                void this.requestRefresh();
            }
        }));
    }

    private scheduleRefresh() {
        if (this.debouncedRefresh) {
            clearTimeout(this.debouncedRefresh);
        }
        this.debouncedRefresh = setTimeout(() => {
            this.debouncedRefresh = null;
            void this.requestRefresh();
        }, 1000);
    }

    private updateTargetFile(): boolean {
        const prevPath = this.targetFile?.path ?? null;
        let nextTarget: TFile | null = null;

        for (const path of this.getDailyNotePathCandidates(this.currentDate)) {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                nextTarget = file;
                break;
            }
        }

        this.targetFile = nextTarget;
        return (this.targetFile?.path ?? null) !== prevPath;
    }

    public async requestRefresh() {
        if (this.isRefreshing) {
            this.refreshQueued = true;
            return;
        }

        this.isRefreshing = true;
        try {
            do {
                this.refreshQueued = false;
                await this.refresh();
            } while (this.refreshQueued);
        } finally {
            this.isRefreshing = false;
        }
    }

    async refresh() {
        const container = this.contentEl;

        // スクロール位置の保存
        const scrollEl = container.querySelector('.llr-list-container');
        const scrollTop = scrollEl ? scrollEl.scrollTop : 0;

        this.routineSummaryRoleCache.clear();
        const data = await this.loadSummaryData();
        const hasRunningItem = data.futureGroups.some((group) => group.items.some((item) => item.isRunning));
        const hasVisibleItems =
            data.pastGroups.some((group) => group.items.length > 0) ||
            data.futureGroups.some((group) => group.items.length > 0);
        const runningItemKey = this.getRunningItemKey(data);
        const runningItemChanged = runningItemKey !== this.lastRunningItemKey;
        this.lastRunningItemKey = runningItemKey;

        // 差分更新のためにフラグメントを作成
        const fragment = document.createDocumentFragment();
        const innerContainer = fragment.createDiv({ cls: 'llr-summary-container' });

        this.renderHeader(innerContainer, data);
        this.renderList(innerContainer, data);

        // コンテナを空にせず、replaceChildren を使って一瞬で置換する（チラつき防止）
        container.replaceChildren(...Array.from(innerContainer.childNodes));

        // スクロール位置の復元
        requestAnimationFrame(() => {
            const newScrollEl = container.querySelector('.llr-list-container');
            if (newScrollEl) {
                const runningEl = newScrollEl.querySelector<HTMLElement>('.llr-item-running');
                if (this.shouldAutoScrollToRunning()) {
                    if (runningEl) {
                        this.forceScrollRunningItemIntoView(newScrollEl, runningEl);
                        // 近接する再描画で scrollTop 復元に上書きされないよう、短時間だけ再適用を許可する。
                        this.autoScrollToRunningUntilMs = Math.max(
                            this.autoScrollToRunningUntilMs,
                            Date.now() + SummaryView.AUTO_SCROLL_STRONG_REAPPLY_MS,
                        );
                    } else {
                        this.setScrollTopSilently(newScrollEl, scrollTop);
                        // 起動直後など、データ未反映の空描画でフラグを消さない。
                        if (hasVisibleItems && !hasRunningItem) {
                            this.autoScrollToRunningUntilMs = 0;
                        }
                    }
                    return;
                }

                this.setScrollTopSilently(newScrollEl, scrollTop);
                if (runningEl && !this.isManualScrollSuppressed()) {
                    const shouldNudge = runningItemChanged || !this.isRunningItemComfortablyVisible(newScrollEl, runningEl);
                    if (shouldNudge) {
                        this.gentlyRevealRunningItem(newScrollEl, runningEl);
                    }
                }
            }
        });
    }

    private async loadSummaryData(): Promise<SummaryPresentation> {
        if (!this.targetFile) {
            return {
                header: { total: '0:00', end: '--:--' },
                pastGroups: [],
                futureGroups: [],
                hiddenItems: [],
            };
        }

        const content = await this.app.vault.read(this.targetFile);
        const lines = content.split('\n');
        const nowTime = moment().format('HH:mm');

        const data = computeSummaryData(lines, nowTime, calculateDuration);
        const presentation = buildSummaryPresentation(data, {
            nowTime,
            isSleepItem: (item) => this.isSleepSummaryRole(item),
            resolveSectionLabel: (item) => this.resolveSectionLabelForItem(item),
            resolveWarningRatio: () => 0,
        });

        // ヘッダーに日付を追加（computeSummaryData の結果にマージ）
        return {
            ...presentation,
            header: {
                ...presentation.header,
                date: this.formatHeaderDate(this.currentDate),
            }
        };
    }

    private formatHeaderDate(date: moment.Moment): string {
        return `${date.format('MM-DD')} (${this.getJapaneseWeekday(date)})`;
    }

    private getJapaneseWeekday(date: moment.Moment): string {
        return ['日', '月', '火', '水', '木', '金', '土'][date.day()];
    }

    private getWeekdayToneClass(date: moment.Moment): string {
        const day = date.day();
        if (day === 0) return 'day-sunday';
        if (day === 6) return 'day-saturday';
        return 'day-weekday';
    }

    private getDailyNotePathCandidates(date: moment.Moment): string[] {
        const candidates: string[] = [];

        // Core Daily Notes plugin settings (preferred source)
        type DailyNotesPlugin = { enabled?: boolean; instance?: { options?: Record<string, unknown> } };
        type AppWithPlugins = { internalPlugins?: { getPluginById?: (id: string) => DailyNotesPlugin | null } };
        const dailyNotesPlugin = (this.app as unknown as AppWithPlugins).internalPlugins?.getPluginById?.('daily-notes');
        if (dailyNotesPlugin?.enabled) {
            const options = (dailyNotesPlugin.instance?.options ?? {}) as Record<string, unknown>;
            const format = (typeof options.format === 'string' ? options.format : '') || 'YYYY-MM-DD';
            const folder = (typeof options.folder === 'string' ? options.folder : '').trim();
            const fileName = `${date.format(format)}.md`;
            candidates.push(folder ? `${folder}/${fileName}` : fileName);
        }

        // Legacy custom setting fallback (if available)
        const plugins = (this.app as Record<string, unknown>).plugins as Record<string, unknown> | undefined;
        const pluginsMap = plugins?.plugins as Record<string, Record<string, unknown>> | undefined;
        const llrPlugin = pluginsMap?.['llr'];
        const llrSettings = llrPlugin?.settings as Record<string, unknown> | undefined;
        const rawWorkoutFolder = llrSettings?.workoutFolder;
        const workoutFolder = (typeof rawWorkoutFolder === 'string' ? rawWorkoutFolder : '').trim();
        if (workoutFolder) {
            candidates.push(`${workoutFolder}/${date.format('YYYY-MM-DD')}.md`);
        }

        // Root fallback (useful when no folder setting is configured)
        candidates.push(`${date.format('YYYY-MM-DD')}.md`);
        candidates.push(`Workouts/${date.format('YYYY-MM-DD')}.md`);

        return [...new Set(candidates)];
    }

    // ─── ヘッダー ─────────────────────────────────────────────────

    private renderHeader(container: HTMLElement, data: SummaryPresentation) {
        const navHeader = container.createEl('div', { cls: 'llr-nav-header' });

        const dateNav = navHeader.createEl('div', { cls: 'llr-date-nav' });

        const dateLabel = dateNav.createEl('div', {
            cls: 'llr-date-label'
        });
        dateLabel.createSpan({
            cls: 'llr-date-main',
            text: this.currentDate.format('MM-DD')
        });
        dateLabel.createSpan({
            cls: `llr-date-dow ${this.getWeekdayToneClass(this.currentDate)}`,
            text: `(${this.getJapaneseWeekday(this.currentDate)})`
        });
        dateLabel.setAttribute('aria-label', data.header.date);
        dateLabel.onclick = () => {
            void this.openCurrentDateNote();
        };

        const navBtns = dateNav.createEl('div', { cls: 'llr-nav-btns' });

        const prevBtn = navBtns.createEl('div', { cls: 'clickable-icon llr-nav-btn', attr: { 'aria-label': '前の日' } });
        setIcon(prevBtn, 'chevron-left');
        prevBtn.onclick = () => {
            this.currentDate.subtract(1, 'day');
            this.updateTargetFile();
            this.requestAutoScrollToRunning();
            void this.requestRefresh();
        };

        const todayBtn = navBtns.createEl('div', { cls: 'clickable-icon llr-nav-btn', text: 'Today', attr: { 'aria-label': '今日へ移動' } });
        todayBtn.onclick = () => {
            this.currentDate = moment();
            this.updateTargetFile();
            this.requestAutoScrollToRunning();
            void this.requestRefresh();
        };

        const nextBtn = navBtns.createEl('div', { cls: 'clickable-icon llr-nav-btn', attr: { 'aria-label': '次の日' } });
        setIcon(nextBtn, 'chevron-right');
        nextBtn.onclick = () => {
            this.currentDate.add(1, 'day');
            this.updateTargetFile();
            this.requestAutoScrollToRunning();
            void this.requestRefresh();
        };

        // サマリー行
        const infoRow = navHeader.createEl('div', { cls: 'llr-summary-info' });

        const totalBox = infoRow.createEl('div', { cls: 'llr-info-box' });
        totalBox.createEl('span', { text: 'Est. Total', cls: 'llr-info-label' });
        totalBox.createEl('span', { text: data.header.total, cls: 'llr-info-value' });

        const endBox = infoRow.createEl('div', { cls: 'llr-info-box' });
        endBox.createEl('span', { text: 'Est. Finish', cls: 'llr-info-label' });
        if (data.header.wake) {
            const valueRow = endBox.createEl('span', { cls: 'llr-info-value llr-info-value-inline' });
            valueRow.createSpan({ text: data.header.end });
            valueRow.createSpan({ text: `- ${data.header.wake}`, cls: 'llr-info-value-tail' });
        } else {
            endBox.createEl('span', { text: data.header.end, cls: 'llr-info-value' });
        }
    }

    private renderList(container: HTMLElement, data: SummaryPresentation) {
        const listContainer = container.createEl('div', { cls: 'nav-files-container llr-list-container' });
        listContainer.onscroll = () => {
            this.handleListScroll();
        };
        const MAX_SCALE_MIN = 120;
        this.renderLane(listContainer, data.pastGroups, MAX_SCALE_MIN);
        this.renderLane(listContainer, data.futureGroups, MAX_SCALE_MIN);
    }

    private renderLane(
        parent: HTMLElement,
        groups: SummaryRenderGroup[],
        maxScaleMin: number,
    ): void {
        for (const group of groups) {
            if (group.showSection && group.sectionLabel !== null) {
                this.renderSectionDivider(parent, group.sectionLabel);
            }
            for (const item of group.items) {
                this.renderItem(parent, item, maxScaleMin, { isLeftover: item.role === 'leftover-active' });
            }
        }
    }

    private getRoutineSectionDefinitions(): Array<{ value: number; label: string }> {
        const appPlugins = (this.app as Record<string, unknown>).plugins as Record<string, unknown> | undefined;
        const plugMap = appPlugins?.plugins as Record<string, Record<string, unknown>> | undefined;
        const llrSettings = plugMap?.['llr']?.settings as Record<string, unknown> | undefined;
        const raw: unknown[] = (llrSettings?.sectionDefinitions ?? []) as unknown[];
        if (!Array.isArray(raw)) return [];

        return raw
            .map((x) => {
                const time = String(x?.time ?? '');
                const label = String(x?.label ?? '').trim();
                if (!/^\d{4}$/.test(time) || !label) return null;
                const hh = Number(time.slice(0, 2));
                const mm = Number(time.slice(2, 4));
                if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
                return { value: hh * 100 + mm, label };
            })
            .filter((x): x is { value: number; label: string } => !!x)
            .sort((a, b) => a.value - b.value || a.label.localeCompare(b.label, 'ja'));
    }

    private resolveSectionLabelForItem(item: SummaryItem): string | null {
        const start = item.displayStartTime ?? item.times[0];
        if (!start || !/^\d{2}:\d{2}$/.test(start)) return null;
        const [hh, mm] = start.split(':').map(Number);
        const value = hh * 100 + mm;
        const defs = this.getRoutineSectionDefinitions();
        if (defs.length === 0) return null;

        let selected: string | null = null;
        for (const def of defs) {
            if (value >= def.value) {
                selected = def.label;
                continue;
            }
            break;
        }
        if (selected !== null) return selected;

        // After midnight, wrap to the final section until the first section starts.
        return defs[defs.length - 1]?.label ?? null;
    }

    private renderSectionDivider(
        parent: HTMLElement,
        label: string,
    ) {
        const row = parent.createEl('div', { cls: 'llr-section-divider-row' });
        row.createEl('div', { cls: 'llr-section-divider-line' });
        row.createEl('div', { cls: 'llr-section-divider-label', text: label });
        row.createEl('div', { cls: 'llr-section-divider-line' });
    }

    private renderItem(parent: HTMLElement, item: SummaryItem, maxScaleMin: number, options?: { isLeftover?: boolean }) {
        const treeItem = parent.createEl('div', { cls: 'tree-item nav-file' });
        if (item.isDone) treeItem.addClass('llr-item-done');
        if (item.isRunning) treeItem.addClass('llr-item-running');
        if (options?.isLeftover) treeItem.addClass('llr-item-leftover');

        const self = treeItem.createEl('div', {
            cls: 'tree-item-self nav-file-title llr-item-self',
        });
        self.addClass('is-clickable');
        self.onclick = (ev) => {
            const target = ev.target instanceof HTMLElement ? ev.target : null;
            if (target?.closest('a')) return;
            void this.jumpToLine(item.line);
        };

        const rowTop = self.createEl('div', { cls: 'llr-row-top' });
        if (item.isProjected) rowTop.addClass('llr-is-projected');

        const startTime = item.displayStartTime ?? '-';
        const endTime = item.displayEndTime ?? '-';
        const timeStr = `${startTime} - ${endTime}`;
        const timeEl = rowTop.createEl('span', { cls: 'llr-time', text: timeStr });
        this.applyReservedStartTint(timeEl, item);

        const barPct = item.duration > 0
            ? Math.min(100, (item.duration / maxScaleMin) * 100)
            : 0;
        const barWrap = rowTop.createEl('div', { cls: 'llr-bar-wrap' });
        const barFill = barWrap.createEl('div', { cls: 'llr-bar-fill' });
        barFill.style.width = `${barPct}%`;

        const rowBottom = self.createEl('div', { cls: 'llr-row-bottom' });
        const taskNameEl = rowBottom.createEl('span', {
            cls: 'nav-file-title-content llr-task-name',
        });
        this.renderTaskName(taskNameEl, item.displayText || '(無題)');

        if (this.isReservedStartItem(item)) {
            const reserved = item.times[0];
            const tailEl = taskNameEl.createEl('span', {
                cls: 'llr-reserved-tail',
                attr: {
                    title: `予定開始: ${reserved}`,
                    'aria-label': `予定開始 ${reserved}`,
                },
            });
            const iconEl = tailEl.createEl('span', {
                cls: 'llr-reserved-icon',
            });
            setIcon(iconEl, 'clock-3');
            tailEl.createEl('span', {
                cls: 'llr-reserved-time',
                text: reserved,
            });
        }
    }

    private getFirstWikiLinkTarget(text: string): string | null {
        const match = text.match(/\[\[([^[\]|#]+)(?:[|#][^\]]*)?\]\]/);
        return match?.[1]?.trim() || null;
    }

    private getRoutineSummaryRole(item: SummaryItem): string | null {
        const linkTarget = this.getFirstWikiLinkTarget(item.text);
        if (!linkTarget) return null;

        if (this.routineSummaryRoleCache.has(linkTarget)) {
            return this.routineSummaryRoleCache.get(linkTarget) ?? null;
        }

        const file = this.app.metadataCache.getFirstLinkpathDest(linkTarget, this.targetFile?.path ?? '');
        if (!(file instanceof TFile) || !this.isRootRoutineFile(file)) {
            this.routineSummaryRoleCache.set(linkTarget, null);
            return null;
        }

        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const raw = fm?.summary_role;
        const role = typeof raw === 'string' ? raw.trim().toLowerCase() : null;
        const normalized = role || null;
        this.routineSummaryRoleCache.set(linkTarget, normalized);
        return normalized;
    }

    private isRootRoutineFile(file: TFile): boolean {
        const folderPrefix = `${SummaryView.routineFolder}/`;
        if (!file.path.startsWith(folderPrefix) || file.extension !== 'md') return false;
        const afterFolder = file.path.slice(folderPrefix.length);
        return !afterFolder.includes('/');
    }

    private isSleepSummaryRole(item: SummaryItem): boolean {
        return this.getRoutineSummaryRole(item) === 'sleep';
    }

    private isReservedStartItem(item: SummaryItem): boolean {
        return !item.isDone && !item.isRunning && item.times.length === 1;
    }

    private parseClockMinutes(hhmm?: string): number | null {
        if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
        const [hh, mm] = hhmm.split(':').map(Number);
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
        return hh * 60 + mm;
    }

    private getReservedStartDelayMinutes(item: SummaryItem): number {
        if (!this.isReservedStartItem(item)) return 0;
        const reservedMin = this.parseClockMinutes(item.times[0]);
        const displayMin = this.parseClockMinutes(item.displayStartTime);
        if (reservedMin === null || displayMin === null) return 0;
        return Math.max(0, displayMin - reservedMin);
    }

    private applyReservedStartTint(timeEl: HTMLElement, item: SummaryItem): void {
        const delayMin = this.getReservedStartDelayMinutes(item);
        if (delayMin <= 0) return;

        const stepped = Math.ceil(Math.min(delayMin, 60) / 5) * 5;
        const ratio = Math.max(0, Math.min(1, stepped / 60));
        const percent = Math.round(ratio * 100);
        timeEl.style.setProperty(
            'color',
            `color-mix(in srgb, var(--text-normal) ${100 - percent}%, var(--text-error) ${percent}%)`,
            'important'
        );
    }

    private async jumpToLine(line: number) {
        if (!this.targetFile) return;
        await this.app.workspace.getLeaf(false).openFile(this.targetFile);
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            const lineText = view.editor.getLine(line) ?? '';
            const lineEnd = lineText.length;
            view.editor.setCursor(line, lineEnd);
            view.editor.scrollIntoView({ from: { line, ch: lineEnd }, to: { line, ch: lineEnd } }, true);
        }
    }

    private async openCurrentDateNote() {
        const file = await this.ensureCurrentDateNote();
        if (!file) {
            void this.requestRefresh();
            return;
        }

        await this.app.workspace.getLeaf(false).openFile(file);
        void this.requestRefresh();
    }

    private async ensureCurrentDateNote(): Promise<TFile | null> {
        type DailyNotesPlugin2 = { enabled?: boolean; instance?: { getDailyNote?: (date: unknown) => TFile | null } };
        type AppWithPlugins2 = { internalPlugins?: { getPluginById?: (id: string) => DailyNotesPlugin2 | null } };
        const dailyNotesPlugin = (this.app as unknown as AppWithPlugins2).internalPlugins?.getPluginById?.('daily-notes');
        if (!dailyNotesPlugin?.enabled) {
            new Notice('Enable the core daily notes plugin to open or create daily notes.');
            return null;
        }

        const instance = dailyNotesPlugin.instance as Record<string, unknown> | undefined;
        if (typeof instance?.getDailyNote !== 'function') {
            new Notice('Daily notes API is unavailable. Reload Obsidian and try again.');
            return null;
        }

        if (!this.currentDate.isSame(moment(), 'day')) {
            this.updateTargetFile();
            if (this.targetFile) {
                return this.targetFile;
            }

            new Notice(`Daily note not found: ${this.currentDate.format('YYYY-MM-DD')}`);
            return null;
        }

        try {
            const getDailyNote = instance.getDailyNote as (date: moment.Moment) => Promise<unknown>;
            const dailyNote = await getDailyNote(this.currentDate.clone());
            if (dailyNote instanceof TFile) {
                this.targetFile = dailyNote;
                return dailyNote;
            }
        } catch (error) {
            console.error('[LLR] Failed to get daily note via core API', error);
        }

        new Notice(`Daily note could not be opened: ${this.currentDate.format('YYYY-MM-DD')}`);
        return null;
    }

    private renderTaskName(parent: HTMLElement, text: string) {
        const wikiLinkPattern = /\[\[([^[\]]+)\]\]/g;
        let lastIndex = 0;
        let matched = false;

        for (const match of text.matchAll(wikiLinkPattern)) {
            matched = true;
            const start = match.index ?? 0;
            const end = start + match[0].length;

            if (start > lastIndex) {
                parent.createSpan({ text: text.slice(lastIndex, start) });
            }

            const rawTarget = match[1];
            const [linkTarget, alias] = rawTarget.split('|');
            const label = alias ?? linkTarget;

            const linkEl = parent.createEl('a', {
                cls: 'internal-link llr-task-link',
                text: label,
                attr: { href: linkTarget }
            });
            linkEl.onclick = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                void this.app.workspace.openLinkText(linkTarget, this.targetFile?.path ?? '', false);
            };

            lastIndex = end;
        }

        if (!matched) {
            parent.setText(text);
            return;
        }

        if (lastIndex < text.length) {
            parent.createSpan({ text: text.slice(lastIndex) });
        }
    }

    private requestAutoScrollToRunning(durationMs = SummaryView.AUTO_SCROLL_REQUEST_MS): void {
        this.autoScrollToRunningUntilMs = Date.now() + durationMs;
    }

    private isViewingTargetDailyNote(): boolean {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        return !!(activeView?.file && this.targetFile && activeView.file.path === this.targetFile.path);
    }

    private handleListScroll(): void {
        if (Date.now() <= this.ignoreScrollEventsUntilMs) {
            return;
        }

        this.manualScrollSuppressedUntilMs = Math.max(
            this.manualScrollSuppressedUntilMs,
            Date.now() + SummaryView.AUTO_SCROLL_USER_SUPPRESS_MS,
        );
    }

    private setScrollTopSilently(scrollEl: HTMLElement, nextScrollTop: number): void {
        const clamped = Math.max(0, nextScrollTop);
        if (Math.abs(scrollEl.scrollTop - clamped) < 1) {
            return;
        }

        this.ignoreScrollEventsUntilMs = Math.max(
            this.ignoreScrollEventsUntilMs,
            Date.now() + SummaryView.AUTO_SCROLL_IGNORE_EVENT_MS,
        );
        scrollEl.scrollTop = clamped;
    }

    private forceScrollRunningItemIntoView(scrollEl: HTMLElement, runningEl: HTMLElement): void {
        const listRect = scrollEl.getBoundingClientRect();
        const itemRect = runningEl.getBoundingClientRect();
        const targetTop = listRect.top + SummaryView.AUTO_SCROLL_TOP_MARGIN_PX;
        const nextScrollTop = scrollEl.scrollTop + (itemRect.top - targetTop);
        this.setScrollTopSilently(scrollEl, nextScrollTop);
    }

    private gentlyRevealRunningItem(scrollEl: HTMLElement, runningEl: HTMLElement): void {
        const listRect = scrollEl.getBoundingClientRect();
        const itemRect = runningEl.getBoundingClientRect();
        const visibleTop = listRect.top + SummaryView.AUTO_SCROLL_TOP_MARGIN_PX;
        const visibleBottom = listRect.bottom - SummaryView.AUTO_SCROLL_BOTTOM_MARGIN_PX;

        if (itemRect.top < visibleTop) {
            const nextScrollTop = scrollEl.scrollTop + (itemRect.top - visibleTop);
            this.setScrollTopSilently(scrollEl, nextScrollTop);
            return;
        }

        if (itemRect.bottom > visibleBottom) {
            const nextScrollTop = scrollEl.scrollTop + (itemRect.bottom - visibleBottom);
            this.setScrollTopSilently(scrollEl, nextScrollTop);
        }
    }

    private isRunningItemComfortablyVisible(scrollEl: HTMLElement, runningEl: HTMLElement): boolean {
        const listRect = scrollEl.getBoundingClientRect();
        const itemRect = runningEl.getBoundingClientRect();
        const visibleTop = listRect.top + SummaryView.AUTO_SCROLL_TOP_MARGIN_PX;
        const visibleBottom = listRect.bottom - SummaryView.AUTO_SCROLL_BOTTOM_MARGIN_PX;
        return itemRect.top >= visibleTop && itemRect.bottom <= visibleBottom;
    }

    private isManualScrollSuppressed(): boolean {
        return Date.now() <= this.manualScrollSuppressedUntilMs;
    }

    private getRunningItemKey(data: SummaryPresentation): string | null {
        for (const group of data.futureGroups) {
            for (const item of group.items) {
                if (item.isRunning) {
                    const path = this.targetFile?.path ?? '';
                    return `${path}:${item.line}`;
                }
            }
        }

        return null;
    }

    private shouldAutoScrollToRunning(): boolean {
        return Date.now() <= this.autoScrollToRunningUntilMs;
    }
}
