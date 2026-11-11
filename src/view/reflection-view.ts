import { Component, ItemView, MarkdownRenderer, Notice, Platform, TFile, WorkspaceLeaf, moment, setIcon, setTooltip } from 'obsidian';
import { buildReflectionAxisLayout, formatReflectionClock, reflectionDisplayBlocks, reflectionOverviewTicks } from '../service/reflection-axis-layout';
import { finishNativeDateSelection, wireNativeDatePicker } from './native-date-picker';
import { ReflectionExpansionState } from '../service/reflection-expansion';
import { resolveDailyNoteDate, type DailyNoteSettings } from '../service/daily-note-context';
import { buildReflectionTimeline, type ReflectionTask, type ReflectionBlock } from '../service/reflection-timeline';

export const VIEW_TYPE_REFLECTION = 'llr-reflection-view';
interface DayEntry { date: string; file: TFile | null }
interface Anchor { key: string; offset: number; top: number; day?: string; dayOffset?: number }

/** Read-only central timeline. No task mutation or running-task auto-follow. */
export class ReflectionView extends ItemView {
    private scroller!: HTMLElement;
    private daysEl!: HTMLElement;
    private dateInput!: HTMLInputElement;
    private currentDayLabel!: HTMLButtonElement;
    private currentDayMain!: HTMLElement;
    private currentDayWeekday!: HTMLElement;
    private currentDayYear!: HTMLElement;
    private previousDayButton!: HTMLButtonElement;
    private followingDayButton!: HTMLButtonElement;
    private pastButton!: HTMLButtonElement;
    private nextButton!: HTMLButtonElement;
    private index: DayEntry[] = [];
    private visible: DayEntry[] = [];
    private expansion = new ReflectionExpansionState();
    private expandButton!: HTMLButtonElement;
    private openNoteButton: HTMLButtonElement | null = null;
    private readonly detailSetters = new WeakMap<HTMLDetailsElement, { key: string; setOpen: (open: boolean) => Promise<void> }>();
    private isSettingAllDetails = false;
    private userScrollRevision = 0;
    private pending = Promise.resolve();
    private closed = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private dirty = new Set<string>();
    private anchor: Anchor | null = null;
    private pendingDisplayDate: string | null = null;
    private readonly sections = new Map<string, HTMLElement>();
    private readonly extending = new Set<number>();
    private readonly dayComponents = new WeakMap<HTMLElement, Component>();

    constructor(
        leaf: WorkspaceLeaf,
        private readonly getSettings: () => DailyNoteSettings,
        private readonly showTasks?: () => void,
        private readonly openDateNote?: (date: string) => Promise<void>,
    ) { super(leaf); }
    getViewType() { return VIEW_TYPE_REFLECTION; }
    getDisplayText() { return '振り返り'; }
    getIcon() { return 'history'; }

    getDisplayDate(): string { return this.dateInput?.value ?? this.today(); }

    setDisplayDate(date: string): Promise<void> {
        return this.enqueue(async () => {
            if (date !== this.getDisplayDate()) await this.jump(date);
        });
    }

    onOpen(): Promise<void> {
        this.closed = false;
        this.contentEl.empty();
        this.contentEl.addClass('llr-reflection');
        if (this.showTasks) this.contentEl.addClass('llr-unified-timeline');
        const toolbar = this.contentEl.createDiv('llr-reflection-toolbar');
        const dateNavigation = toolbar.createDiv('llr-reflection-date-nav');
        const dateLabel = dateNavigation.createDiv('llr-reflection-date-picker');
        this.currentDayYear = dateLabel.createSpan('llr-reflection-date-year');
        this.currentDayYear.hidden = true;
        this.currentDayLabel = dateLabel.createEl('button', { cls: 'llr-reflection-date-label', attr: { 'aria-label': '日付を選ぶ', title: '日付を選ぶ' } });
        this.currentDayMain = this.currentDayLabel.createSpan({ cls: 'llr-date-main', text: moment(this.today()).format('MM-DD') });
        this.currentDayWeekday = this.currentDayLabel.createSpan('llr-date-dow llr-reflection-date-weekday');
        const navigation = dateNavigation.createDiv('llr-nav-btns');
        this.previousDayButton = navigation.createEl('button', { cls: 'clickable-icon llr-nav-btn', attr: { 'aria-label': '前の日', title: '前の日' } });
        setIcon(this.previousDayButton, 'chevron-left');
        this.previousDayButton.onclick = () => this.enqueue(() => this.moveDay(-1));
        navigation.createEl('button', { text: 'Today', cls: 'llr-nav-btn llr-reflection-today', attr: { 'aria-label': '今日へ移動', title: '今日へ移動' } }).onclick = () => this.enqueue(() => this.jump(this.today()));
        this.followingDayButton = navigation.createEl('button', { cls: 'clickable-icon llr-nav-btn', attr: { 'aria-label': '次の日', title: '次の日' } });
        setIcon(this.followingDayButton, 'chevron-right');
        this.followingDayButton.onclick = () => this.enqueue(() => this.moveDay(1));
        const tools = toolbar.createDiv('llr-reflection-tools');
        this.dateInput = dateLabel.createEl('input', { type: 'date', cls: 'llr-reflection-date-input', attr: { 'aria-label': '日付を選ぶ', tabindex: '-1' } });
        this.dateInput.max = this.today();
        this.dateInput.value = this.today();
        wireNativeDatePicker(this.currentDayLabel, this.dateInput);
        this.dateInput.onchange = () => {
            const date = this.dateInput.value;
            finishNativeDateSelection(this.currentDayLabel, this.dateInput);
            void this.enqueue(() => this.jump(date));
        };
        this.expandButton = tools.createEl('button', { cls: 'clickable-icon llr-nav-btn llr-reflection-expand-all', attr: { 'aria-label': 'すべて展開' } });
        setIcon(this.expandButton, 'move-vertical');
        this.expandButton.disabled = true;
        this.expandButton.onclick = () => this.enqueue(() => this.setAllDetails(this.expansion.shouldOpenAll(this.getDetailKeys())));
        if (this.showTasks) {
            tools.addClass('llr-display-tools');
            if (this.openDateNote) {
                this.openNoteButton = tools.createEl('button', { cls: 'clickable-icon llr-nav-btn llr-reflection-open-note', attr: { 'aria-label': '表示日のノートを開く' } });
                setIcon(this.openNoteButton, 'file-text');
                this.openNoteButton.onclick = () => { void this.openDateNote?.(this.getDisplayDate()).catch(error => {
                    console.error('[LLR] Daily note could not be opened', error);
                    new Notice('ノートを開けませんでした。');
                }); };
                const noteLabel = `${this.getDisplayDate()}のノートを開く`;
                this.openNoteButton.setAttribute('aria-label', noteLabel);
                setTooltip(this.openNoteButton, noteLabel);
            }
            const toggle = tools.createEl('button', { cls: 'clickable-icon llr-display-switch', attr: { 'aria-label': 'タスクを表示', title: 'タスクを表示' } });
            setIcon(toggle, 'list-checks');
            toggle.onclick = this.showTasks;
        }
        this.scroller = this.contentEl.createDiv('llr-reflection-scroll');
        const viewportObserver = new ResizeObserver(() => {
            if (this.scroller.clientHeight) {
                this.scroller.style.setProperty('--llr-reflection-viewport-height', `${this.scroller.clientHeight}px`);
                this.restorePendingDate();
                // Wrapping can change the first visible day without a scroll event.
                this.syncCurrentDay();
            }
        });
        viewportObserver.observe(this.scroller);
        this.register(() => viewportObserver.disconnect());
        this.scroller.tabIndex = 0;
        this.pastButton = this.scroller.createEl('button', { cls: 'llr-reflection-edge', text: '↑ 過去の記録' });
        this.pastButton.onclick = () => this.requestExtend(-1);
        this.daysEl = this.scroller.createDiv('llr-reflection-days');
        this.nextButton = this.scroller.createEl('button', { cls: 'llr-reflection-edge', text: '新しい記録 ↓' });
        this.nextButton.onclick = () => this.requestExtend(1);
        this.registerDomEvent(this.scroller, 'pointerdown', () => { this.userScrollRevision++; });
        this.registerDomEvent(this.scroller, 'wheel', () => { this.userScrollRevision++; });
        this.registerDomEvent(this.scroller, 'touchmove', () => { this.userScrollRevision++; });
        this.registerDomEvent(this.scroller, 'keydown', event => {
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) this.userScrollRevision++;
        });
        this.registerDomEvent(this.scroller, 'scroll', () => {
            if (!this.scroller.clientHeight || this.isSettingAllDetails) return;
            this.anchor = this.captureAnchor();
            this.syncCurrentDay();
            if (this.scroller.scrollTop < 160) this.requestExtend(-1);
            else if (this.scroller.scrollTop + this.scroller.clientHeight > this.scroller.scrollHeight - 160) {
                this.requestExtend(1);
            }
        });
        const changed = (file: TFile) => {
            this.dirty.add(file.path);
            this.scheduleRefresh();
        };
        this.registerEvent(this.app.vault.on('modify', file => { if (file instanceof TFile) changed(file); }));
        this.registerEvent(this.app.vault.on('create', file => { if (file instanceof TFile) changed(file); }));
        this.registerEvent(this.app.vault.on('delete', file => { if (file instanceof TFile) changed(file); }));
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            this.dirty.add(oldPath);
            if (file instanceof TFile) changed(file);
        }));
        this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => {
            if (leaf === this.leaf) {
                requestAnimationFrame(() => { if (!this.closed) this.restoreAnchor(this.anchor); });
                this.scheduleRefresh();
            }
        }));
        return this.enqueue(() => this.jump(this.today()));
    }

    onClose(): Promise<void> {
        this.closed = true;
        this.sections.forEach(section => this.releaseDay(section));
        if (this.timer) clearTimeout(this.timer);
        return Promise.resolve();
    }

    private today(): string { return moment().subtract(3, 'hours').format('YYYY-MM-DD'); }

    private enqueue(work: () => Promise<void>) {
        const operation = this.pending.then(async () => { if (!this.closed) await work(); });
        this.pending = operation.catch(error => {
            console.error('[LLR] Reflection read failed', error);
            if (!this.closed) new Notice('振り返りを読み込めませんでした。再度開いてください。');
        });
        return operation;
    }

    private rebuildIndex() {
        const settings = this.getSettings();
        const dates = new Map<string, DayEntry>();
        for (const file of this.app.vault.getMarkdownFiles()) {
            const date = resolveDailyNoteDate(file, settings, (text, format) => {
                const parsed = moment(text, format, true);
                return parsed.isValid() ? parsed.toDate() : null;
            });
            if (!date) continue;
            const key = moment(date).format('YYYY-MM-DD');
            if (key <= this.today()) dates.set(key, { date: key, file });
        }
        if (!dates.has(this.today())) dates.set(this.today(), { date: this.today(), file: null });
        this.index = [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
    }

    private async moveDay(direction: -1 | 1) {
        const current = moment(this.dateInput.value, 'YYYY-MM-DD', true);
        if (!current.isValid()) return;
        await this.jump(current.add(direction, 'day').format('YYYY-MM-DD'));
    }

    private async jump(date: string) {
        if (!moment(date, 'YYYY-MM-DD', true).isValid()) return;
        date = date > this.today() ? this.today() : date;
        this.rebuildIndex();
        if (!this.index.some(day => day.date === date)) {
            this.index.push({ date, file: null });
            this.index.sort((a, b) => a.date.localeCompare(b.date));
        }
        const existing = this.sections.get(date);
        if (!existing) {
            const at = this.index.findIndex(day => day.date === date);
            const days = this.index.slice(Math.max(0, at - 2), at + 3);
            const sections = await Promise.all(days.map(day => this.makeDay(day)));
            if (this.closed) { sections.forEach(section => this.releaseDay(section)); return; }
            this.sections.forEach(section => this.releaseDay(section));
            this.visible = days;
            this.sections.clear();
            this.daysEl.empty();
            sections.forEach((section, i) => { this.sections.set(days[i].date, section); this.daysEl.append(section); });
            this.updateEdges();
        }
        this.dateInput.value = date;
        this.dateInput.max = this.today();
        // Saved workspace state can arrive before the leaf is shown. Zero-sized
        // geometry cannot position a day; retain the requested date until visible.
        this.pendingDisplayDate = this.scrollToDate(date) ? null : date;
        this.anchor = this.pendingDisplayDate ? null : this.captureAnchor();
        this.syncExpandButton();
    }

    private scrollToDate(date: string): boolean {
        if (this.scroller.clientHeight === 0) return false;
        // During plugin reload, saved views can open before the plugin CSS has
        // loaded. A natural-height div reports a size but cannot scroll yet.
        if (!['auto', 'scroll', 'overlay'].includes(getComputedStyle(this.scroller).overflowY)) return false;
        // ResizeObserver may not have run yet during workspace restoration.
        // Size the final day before scrolling so the browser cannot clamp the
        // requested date back into the preceding day.
        if (this.scroller.clientHeight) this.scroller.style.setProperty('--llr-reflection-viewport-height', `${this.scroller.clientHeight}px`);
        const section = this.sections.get(date);
        if (!section) return false;
        this.scroller.scrollTop += section.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top - 12;
        return true;
    }

    private restorePendingDate(): void {
        if (!this.pendingDisplayDate || !this.scrollToDate(this.pendingDisplayDate)) return;
        this.pendingDisplayDate = null;
        this.anchor = this.captureAnchor();
        this.syncCurrentDay();
    }

    private requestExtend(direction: -1 | 1) {
        if (this.extending.has(direction)) return;
        this.extending.add(direction);
        void this.enqueue(async () => {
            try { await this.extend(direction); } finally { this.extending.delete(direction); }
        });
    }

    private async extend(direction: -1 | 1) {
        if (!this.visible.length) return;
        this.rebuildIndex();
        const first = this.visible[0].date, last = this.visible[this.visible.length - 1].date;
        const candidates = direction < 0 ? this.index.filter(day => day.date < first).slice(-5) : this.index.filter(day => day.date > last).slice(0, 5);
        if (!candidates.length) { this.updateEdges(); return; }
        const sections = await Promise.all(candidates.map(day => this.makeDay(day)));
        if (this.closed) { sections.forEach(section => this.releaseDay(section)); return; }
        // Capture after I/O: the reader may have moved while files were loading.
        const anchor = this.captureAnchor();
        sections.forEach((section, i) => this.sections.set(candidates[i].date, section));
        if (direction < 0) { this.daysEl.prepend(...sections); this.visible.unshift(...candidates); }
        else { this.daysEl.append(...sections); this.visible.push(...candidates); }
        // Bound DOM/body data while allowing either edge to be reloaded later.
        if (this.visible.length > 35) {
            const removed = direction < 0 ? this.visible.splice(35) : this.visible.splice(0, this.visible.length - 35);
            for (const day of removed) {
                const section = this.sections.get(day.date);
                if (section) { this.releaseDay(section); section.remove(); }
                this.sections.delete(day.date);
            }
        }
        this.updateEdges();
        this.restoreAnchor(anchor);
        this.anchor = this.captureAnchor();
        this.syncExpandButton();
    }

    private updateEdges() {
        if (!this.visible.length) return;
        this.pastButton.disabled = !this.index.some(day => day.date < this.visible[0].date);
        this.pastButton.textContent = this.pastButton.disabled ? 'ここからが最初の記録' : '↑ 過去の記録';
        this.nextButton.disabled = this.visible[this.visible.length - 1].date >= this.today();
        this.nextButton.textContent = this.nextButton.disabled ? 'ここまでが今日の記録' : '新しい記録 ↓';
        this.daysEl.querySelectorAll('.llr-reflection-gap').forEach(el => el.remove());
        for (let i = 1; i < this.visible.length; i++) {
            const gap = moment(this.visible[i].date).diff(moment(this.visible[i - 1].date), 'days') - 1;
            if (gap > 0) {
                const label = document.createElement('div');
                label.className = 'llr-reflection-gap'; label.textContent = `${gap}日間 デイリーノートなし`;
                this.sections.get(this.visible[i].date)?.before(label);
            }
        }
    }

    private scheduleRefresh() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.enqueue(() => this.refresh());
        }, 500);
    }

    private async refresh() {
        this.dateInput.max = this.today();
        this.rebuildIndex();
        const dirty = this.dirty;
        this.dirty = new Set();
        const updates: Array<{ day: DayEntry; section: HTMLElement }> = [];
        for (const day of this.visible) {
            const next = this.index.find(entry => entry.date === day.date) ?? { date: day.date, file: null };
            if (next.file?.path !== day.file?.path || (day.file && dirty.has(day.file.path))) {
                updates.push({ day: next, section: await this.makeDay(next) });
            }
        }
        if (this.closed) { updates.forEach(update => this.releaseDay(update.section)); return; }
        const anchor = this.captureAnchor();
        for (const { day, section } of updates) {
            const previous = this.sections.get(day.date);
            if (previous) { this.releaseDay(previous); previous.replaceWith(section); }
            this.sections.set(day.date, section);
            this.visible[this.visible.findIndex(entry => entry.date === day.date)] = day;
        }
        this.updateEdges();
        this.restoreAnchor(anchor);
        this.anchor = this.captureAnchor();
        this.syncExpandButton();
    }

    private captureAnchor(): Anchor | null {
        if (this.scroller.clientHeight === 0) return this.anchor;
        const top = this.scroller.getBoundingClientRect().top;
        const elements = Array.from(this.daysEl.querySelectorAll<HTMLElement>('[data-anchor]'));
        const element = elements.find(el => el.getBoundingClientRect().bottom > top);
        if (!element) return null;
        const day = element.dataset.anchor?.slice(0, 10);
        const heading = day ? this.sections.get(day)?.querySelector('h2') : null;
        return { key: element.dataset.anchor ?? '', offset: element.getBoundingClientRect().top - top, top: this.scroller.scrollTop, day, dayOffset: heading ? heading.getBoundingClientRect().top - top : undefined };
    }

    private restoreAnchor(anchor: Anchor | null) {
        if (!anchor || this.scroller.clientHeight === 0) return;
        const element = Array.from(this.daysEl.querySelectorAll<HTMLElement>('[data-anchor]')).find(el => el.dataset.anchor === anchor.key);
        if (element) this.scroller.scrollTop += element.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top - anchor.offset;
        else {
            const heading = anchor.day ? this.sections.get(anchor.day)?.querySelector('h2') : null;
            if (heading && anchor.dayOffset !== undefined) this.scroller.scrollTop += heading.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top - anchor.dayOffset;
            else this.scroller.scrollTop = anchor.top;
        }
    }

    private async makeDay(day: DayEntry): Promise<HTMLElement> {
        const section = document.createElement('section');
        section.className = 'llr-reflection-day';
        const heading = section.createEl('h2', { text: `${moment(day.date).format('M月D日')}（${['日', '月', '火', '水', '木', '金', '土'][moment(day.date).day()]}）` });
        heading.dataset.anchor = day.date;
        if (day.date === this.today()) heading.createEl('small', { text: '今日' });
        if (!day.file) { section.createEl('p', { text: 'デイリーノートがありません。', cls: 'llr-reflection-empty' }); return section; }
        const timeline = buildReflectionTimeline(await this.app.vault.cachedRead(day.file));
        if (!timeline.tasks.length) section.createEl('p', { text: '記録がありません。', cls: 'llr-reflection-empty' });
        if (this.closed) return section;
        const component = this.addChild(new Component());
        this.dayComponents.set(section, component);
        const blocks = reflectionDisplayBlocks(timeline.blocks);
        const layout = buildReflectionAxisLayout(blocks);
        const axis = section.createDiv('llr-reflection-axis');
        const occurrences = new Map<number | null, number>();
        const renderBlock = async (parent: HTMLElement, index: number, interval?: { startMinute: number; endMinute: number }) => {
            const block = blocks[index];
            const occurrence = occurrences.get(block.startMinute) ?? 0;
            occurrences.set(block.startMinute, occurrence + 1);
            await this.makeBlock(parent, day, block, occurrence, component, interval);
        };
        if (layout.segments.some(segment => segment.kind === 'activity')) {
            for (const segment of layout.segments) {
                if (segment.kind === 'gap') {
                    // Empty leading/trailing hours add no reading value. Keep only internal gaps.
                    const activities = layout.segments.filter(item => item.kind === 'activity');
                    if (activities.some(item => item.endMinute <= segment.startMinute) && activities.some(item => item.startMinute >= segment.endMinute)) this.makeTimeSpace(axis, day, segment.startMinute, segment.endMinute);
                } else if (segment.kind === 'activity' && segment.blockIndex !== undefined) await renderBlock(axis, segment.blockIndex, segment);
            }
        }
        if (layout.outsideDay.length) {
            const continuation = section.createDiv('llr-reflection-outside-day');
            continuation.createDiv({ cls: 'llr-reflection-section-label', text: 'このノートの日界後の記録' });
            for (const index of layout.outsideDay) await renderBlock(continuation, index);
        }
        return section;
    }

    private releaseDay(section: HTMLElement) {
        const component = this.dayComponents.get(section);
        if (component) { this.removeChild(component); this.dayComponents.delete(section); }
    }

    private async renderMarkdown(host: HTMLElement, markdown: string, day: DayEntry, component: Component) {
        host.addClass('markdown-rendered');
        await MarkdownRenderer.render(this.app, markdown, host, day.file?.path ?? '', component);
        // The timeline is a reading surface. Native Markdown task boxes must not edit notes.
        host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(input => { input.disabled = true; });
        component.registerDomEvent(host, 'click', event => {
            const link = event.target instanceof Element ? event.target.closest('a.internal-link') : null;
            if (!link) return;
            const target = link.getAttribute('data-href') ?? link.getAttribute('href');
            if (target) {
                event.preventDefault();
                event.stopPropagation();
                void this.app.workspace.openLinkText(target, day.file?.path ?? '', 'tab');
            }
        });
    }

    private hourHeight(): number {
        const style = getComputedStyle(this.scroller);
        const textSize = Number.parseFloat(style.fontSize) || 16;
        const lineHeight = Number.parseFloat(style.lineHeight) || textSize * 1.5;
        const spacing = Number.parseFloat(style.getPropertyValue('--size-4-1')) || 4;
        return Math.max(lineHeight + spacing * 2, Platform.isMobile || window.matchMedia('(pointer: coarse)').matches ? 44 : 40);
    }

    private makeTimeSpace(parent: HTMLElement, day: DayEntry, start: number, end: number) {
        for (let cursor = start; cursor < end;) {
            const next = Math.min(end, (Math.floor(cursor / 60) + 1) * 60);
            const step = parent.createDiv('llr-reflection-time-step');
            step.style.height = `calc(${(next - cursor) / 60} * var(--llr-reflection-hour-height))`;
            step.dataset.anchor = `${day.date}:time:${cursor}`;
            if (cursor % 120 === 0) step.createSpan({ cls: 'llr-reflection-hour llr-reflection-gap-hour', text: String(Math.floor(cursor / 60) % 24) });
            cursor = next;
        }
    }

    private syncCurrentDay() {
        if (!this.currentDayLabel || !this.scroller.clientHeight) return;
        const top = this.scroller.getBoundingClientRect().top;
        const day = this.pendingDisplayDate ? this.visible.find(entry => entry.date === this.pendingDisplayDate) : this.visible.find(entry => {
            const rect = this.sections.get(entry.date)?.getBoundingClientRect();
            return rect && rect.bottom > top + 24;
        });
        if (!day) return;
        const parsed = moment(day.date);
        const dateText = parsed.format('MM-DD');
        const weekday = ['日', '月', '火', '水', '木', '金', '土'][parsed.day()];
        if (this.currentDayMain) { this.currentDayMain.textContent = dateText; this.currentDayWeekday.textContent = weekday; }
        else this.currentDayLabel.textContent = dateText + weekday;
        if (this.currentDayYear) {
            const pastYear = parsed.year() !== moment(this.today()).year();
            this.currentDayYear.hidden = !pastYear;
            this.currentDayYear.textContent = pastYear ? parsed.format('YYYY') : '';
        }
        if (this.currentDayWeekday) {
            this.currentDayWeekday.toggleClass('day-saturday', parsed.day() === 6);
            this.currentDayWeekday.toggleClass('day-sunday', parsed.day() === 0);
            this.currentDayWeekday.toggleClass('day-weekday', parsed.day() > 0 && parsed.day() < 6);
        }
        this.currentDayLabel.setAttribute?.('aria-label', `${parsed.format('YYYY/MM/DD')}、日付を選ぶ`);
        if (this.openNoteButton) {
            const label = `${day.date}のノートを開く`;
            this.openNoteButton.setAttribute('aria-label', label);
            setTooltip(this.openNoteButton, label);
        }
        if (this.followingDayButton) this.followingDayButton.disabled = day.date >= this.today();
        if (document.activeElement !== this.dateInput) this.dateInput.value = day.date;
    }

    private async renderHeading(parent: HTMLElement, day: DayEntry, title: string, component: Component) {
        const name = parent.createDiv('llr-reflection-name');
        await this.renderMarkdown(name, title, day, component);
        // Let external links use their browser default while keeping their click
        // from reaching the surrounding disclosure summary.
        component.registerDomEvent(name, 'click', event => {
            if (event.target instanceof Element && event.target.closest('a:not(.internal-link)')) event.stopPropagation();
        });
        return name;
    }

    private async makeBlock(section: HTMLElement, day: DayEntry, block: ReflectionBlock, occurrence: number, component: Component, interval?: { startMinute: number; endMinute: number }) {
        const key = `${day.date}:block:${block.startMinute}:${occurrence}`;
        const row = section.createDiv('llr-reflection-row');
        const duration = Math.max(0, (block.endMinute ?? block.startMinute ?? 0) - (block.startMinute ?? 0));
        const displayDuration = interval ? interval.endMinute - interval.startMinute : duration;
        const isTimed = block.startMinute !== null && duration > 0;
        row.toggleClass('is-time-band', isTimed);
        row.toggleClass('is-multi-hour', isTimed && displayDuration > 60);
        row.toggleClass('is-point', block.startMinute !== null && !isTimed);
        if (isTimed) {
            const bandHeight = `calc(${displayDuration / 60} * var(--llr-reflection-hour-height))`;
            row.style.minHeight = bandHeight;
            row.style.setProperty('--llr-reflection-band-height', bandHeight);
        }
        const timeLabel = block.startMinute === null ? '' : formatReflectionClock(block.startMinute);
        const makeTicks = () => {
            if (!isTimed || block.startMinute === null) return;
            const start = interval?.startMinute ?? block.startMinute;
            const end = interval?.endMinute ?? block.endMinute ?? start;
            const track = row.createDiv({ cls: 'llr-reflection-hour-track', attr: { 'aria-hidden': 'true' } });
            for (const tick of reflectionOverviewTicks(start, end)) {
                const mark = track.createSpan({ cls: 'llr-reflection-axis-tick' });
                mark.createSpan({ cls: 'llr-reflection-hour llr-reflection-axis-label', text: tick.label });
                mark.dataset.minute = String(tick.minute);
                mark.dataset.anchor = `${day.date}:time:${tick.minute}`;
                mark.style.top = `${tick.fraction * 100}%`;
            }
        };
        if (!block.tasks.length) {
            const overview = row.createDiv('llr-reflection-block-title llr-reflection-overview');
            overview.dataset.anchor = key;
            overview.createSpan({ cls: 'llr-reflection-hour', attr: { 'aria-hidden': 'true' } });
            await this.renderHeading(overview, day, block.title, component);
            makeTicks();
            return;
        }
        const details = row.createEl('details', { cls: 'llr-reflection-block' });
        const summary = details.createEl('summary', { cls: 'llr-reflection-block-title' });
        summary.dataset.anchor = key;
        summary.createSpan({ cls: 'llr-reflection-hour', attr: { 'aria-hidden': 'true' } });
        const name = await this.renderHeading(summary, day, block.title, component);
        const disclosure = summary.createSpan({ cls: 'llr-reflection-disclosure-icon', attr: { 'aria-hidden': 'true' } });
        setIcon(disclosure, 'chevron-down');
        summary.setAttribute('aria-label', `${timeLabel} ${name.textContent ?? ''}`.trim());
        if ((name.textContent?.length ?? 0) > 28) setTooltip(summary, `${timeLabel} ${name.textContent ?? ''}`.trim());
        const records = details.createDiv('llr-reflection-records');
        let bodyComponent: Component | null = null;
        const fill = async () => {
            summary.setAttribute('aria-expanded', String(details.open));
            row.toggleClass('is-collapsed', !details.open);
            if (bodyComponent) { component.removeChild(bodyComponent); bodyComponent = null; }
            records.empty();
            if (details.open) {
                bodyComponent = component.addChild(new Component());
                const occurrences = new Map<string, number>();
                for (const [index, task] of block.tasks.entries()) {
                    const signature = `${task.actualStart}:${task.actualEnd}:${task.title}`;
                    const occurrence = occurrences.get(signature) ?? 0;
                    occurrences.set(signature, occurrence + 1);
                    // The heading retains its title links, so avoid repeating the
                    // same representative title in the expanded record.
                    const repeatTitle = index !== 0 || task.title !== block.title;
                    await this.makeRecord(records, day, task, occurrence, bodyComponent, repeatTitle);
                }
            }
        };
        details.open = this.expansion.isOpen(key);
        this.detailSetters.set(details, { key, setOpen: async open => {
            if (details.open === open) return;
            details.open = open;
            await fill();
        } });
        await fill();
        makeTicks();
        row.onclick = event => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest('summary, a, button, input')) return;
            if (!details.open) summary.click();
        };
        summary.onclick = event => {
            if (event.target instanceof Element && event.target.closest('a')) return;
            event.preventDefault();
            void this.enqueue(async () => {
                let anchor = this.captureAnchor();
                if (anchor && Array.from(records.querySelectorAll<HTMLElement>('[data-anchor]')).some(el => el.dataset.anchor === anchor?.key)) {
                    anchor = { key, offset: summary.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top, top: this.scroller.scrollTop };
                }
                details.open = !details.open;
                this.expansion.setOpen(key, details.open);
                const revision = this.userScrollRevision;
                await fill();
                if (revision === this.userScrollRevision) this.restoreAnchor(anchor);
                this.anchor = this.captureAnchor();
                this.syncExpandButton();
            });
        };
    }

    private getDetailKeys(): string[] {
        return Array.from(this.daysEl.querySelectorAll<HTMLDetailsElement>('details')).flatMap(details => {
            const controller = this.detailSetters.get(details);
            return controller ? [controller.key] : [];
        });
    }

    private syncExpandButton() {
        this.syncCurrentDay();
        if (!this.expandButton) return;
        const keys = this.getDetailKeys();
        this.expandButton.disabled = this.isSettingAllDetails || keys.length === 0;
        const allOpen = keys.length > 0 && !this.expansion.shouldOpenAll(keys);
        const action = allOpen ? 'すべて折りたたむ' : 'すべて展開';
        this.expandButton.classList.toggle('is-active', allOpen);
        setTooltip(this.expandButton, action);
        this.expandButton.setAttribute('aria-label', action);
    }

    private async setAllDetails(open: boolean) {
        let anchor = this.captureAnchor();
        if (!open && anchor) {
            const element = Array.from(this.daysEl.querySelectorAll<HTMLElement>('[data-anchor]')).find(el => el.dataset.anchor === anchor?.key);
            const summary = element?.closest('details')?.querySelector<HTMLElement>('summary');
            if (summary?.dataset.anchor) {
                // A memo is about to disappear. Return to that activity's heading.
                anchor = { key: summary.dataset.anchor, offset: Math.max(0, summary.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top), top: this.scroller.scrollTop };
            }
        }
        const revision = this.userScrollRevision;
        this.expansion.setAll(open);
        this.isSettingAllDetails = true;
        this.syncExpandButton();
        try {
            for (const details of Array.from(this.daysEl.querySelectorAll<HTMLDetailsElement>('details'))) {
                await this.detailSetters.get(details)?.setOpen(open);
            }
            if (revision === this.userScrollRevision) this.restoreAnchor(anchor);
            this.anchor = this.captureAnchor();
        } finally {
            this.isSettingAllDetails = false;
            this.syncExpandButton();
        }
    }

    private async makeRecord(parent: HTMLElement, day: DayEntry, task: ReflectionTask, occurrence: number, component: Component, showTitle = true) {
        const record = parent.createDiv('llr-reflection-record');
        record.dataset.status = task.status;
        record.toggleClass('has-memo', !!task.supplement);
        record.dataset.anchor = `${day.date}:record:${task.actualStart}:${task.actualEnd}:${task.title}:${occurrence}`;
        if (task.kind !== 'memo' && showTitle) {
            const head = record.createDiv('llr-reflection-record-head');
            await this.renderMarkdown(head.createDiv('llr-reflection-record-title'), task.title, day, component);
        }
        if (task.kind !== 'memo' && task.actualStart) {
            const time = task.actualEnd && task.actualEnd !== task.actualStart ? `${task.actualStart}–${task.actualEnd}` : task.actualStart;
            record.createDiv({ cls: 'llr-reflection-record-time', text: time });
        }
        if (task.supplement) {
            // Strip the common task-child indent while preserving relative Markdown nesting.
            const lines = task.supplement.split('\n');
            const indent = Math.min(...lines.filter(line => line.trim()).map(line => line.match(/^[ \t]*/)?.[0].length ?? 0));
            const markdown = lines.map(line => line.slice(Math.min(indent, line.match(/^[ \t]*/)?.[0].length ?? 0))).join('\n');
            await this.renderMarkdown(record.createDiv('llr-reflection-supplement'), markdown, day, component);
        }
    }

}
