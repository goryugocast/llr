import { ItemView, Menu, Notice, WorkspaceLeaf, type ViewStateResult } from 'obsidian';
import { SummaryView, type SummaryViewDelegate, VIEW_TYPE_SUMMARY } from './summary-view';
import { ReflectionView } from './reflection-view';

export type LlrDisplayMode = 'tasks' | 'timeline';

/** One workspace view; existing renderers retain their own data and interactions. */
export class LlrView extends ItemView {
    private summary!: SummaryView;
    private timeline: ReflectionView | null = null;
    private mode: LlrDisplayMode = 'tasks';
    private pending = Promise.resolve();
    private closed = false;

    constructor(leaf: WorkspaceLeaf, private readonly delegate: SummaryViewDelegate) { super(leaf); }
    getViewType() { return VIEW_TYPE_SUMMARY; }
    getDisplayText() { return 'LLR'; }
    getIcon() { return 'list-checks'; }

    async onOpen(): Promise<void> {
        this.closed = false;
        this.contentEl.empty();
        this.contentEl.addClass('llr-unified-view');
        this.summary = this.addChild(new SummaryView(this.leaf, {
            ...this.delegate,
            showTimeline: () => this.switchFromButton('timeline'),
        }));
        this.contentEl.append(this.summary.contentEl);
        // ItemView creates a leaf-level container. Only its content belongs in
        // this pane; leaving the empty sibling attached halves the usable height.
        this.summary.containerEl.remove();
        await this.summary.onOpen();
    }

    private switchFromButton(mode: LlrDisplayMode) {
        void this.showMode(mode, undefined, true).catch(error => {
            console.error('[LLR] Display switch failed', error);
            new Notice('表示を切り替えられませんでした。');
        });
    }

    showMode(mode: LlrDisplayMode, date?: string, focusSwitch = false): Promise<void> {
        const work = this.pending.then(async () => {
            if (this.closed) return;
            const previous = this.mode === 'tasks' ? this.summary : this.timeline;
            const selectedDate = date ?? previous?.getDisplayDate();
            let created: ReflectionView | null = null;
            try {
                if (mode === 'timeline' && !this.timeline) {
                    this.timeline = this.addChild(new ReflectionView(this.leaf, this.delegate.getDailyNoteSettings, () => this.switchFromButton('tasks'), date => this.summary.openDateNote(date)));
                    created = this.timeline;
                    this.contentEl.append(this.timeline.contentEl);
                    this.timeline.containerEl.remove();
                    this.summary.contentEl.hidden = true;
                    await this.timeline.onOpen();
                }
                const next = mode === 'tasks' ? this.summary : this.timeline;
                if (!next) return;
                this.summary.contentEl.hidden = mode !== 'tasks';
                if (this.timeline) this.timeline.contentEl.hidden = mode !== 'timeline';
                // Never reset a renderer already displaying this date: its scroll and
                // accordion state belong to that mode, not to the switch itself.
                if (selectedDate && selectedDate !== next.getDisplayDate()) await next.setDisplayDate(selectedDate);
                if (this.closed) return;
                this.mode = mode;
                this.contentEl.dataset.mode = mode;
                if (focusSwitch) next.contentEl.querySelector<HTMLButtonElement>('.llr-display-switch')?.focus({ preventScroll: true });
            } catch (error) {
                if (created) {
                    await created.onClose();
                    this.removeChild(created);
                    created.contentEl.remove();
                    this.timeline = null;
                }
                // A failed read must leave the last successful mode usable.
                this.summary.contentEl.hidden = this.mode !== 'tasks';
                if (this.timeline) this.timeline.contentEl.hidden = this.mode !== 'timeline';
                if (focusSwitch) previous?.contentEl.querySelector<HTMLButtonElement>('.llr-display-switch')?.focus({ preventScroll: true });
                throw error;
            }
        });
        // Report errors to the caller without poisoning subsequent switches.
        this.pending = work.catch(() => {});
        return work;
    }

    requestRefresh(): Promise<void> { return this.summary?.requestRefresh() ?? Promise.resolve(); }

    getState(): Record<string, unknown> {
        return { displayMode: this.mode, date: (this.mode === 'tasks' ? this.summary : this.timeline)?.getDisplayDate() };
    }

    async setState(state: unknown, result: ViewStateResult): Promise<void> {
        const saved = state as { displayMode?: unknown; date?: unknown } | null;
        await this.showMode(saved?.displayMode === 'timeline' ? 'timeline' : 'tasks', typeof saved?.date === 'string' ? saved.date : undefined);
        await super.setState(state, result);
    }

    onPaneMenu(menu: Menu, source: string): void {
        super.onPaneMenu(menu, source);
        for (const [mode, label] of [['tasks', 'タスクを表示'], ['timeline', 'タイムラインを表示']] as const) {
            menu.addItem(item => item.setTitle(label).setChecked(this.mode === mode).onClick(() => this.switchFromButton(mode)));
        }
    }

    async onClose(): Promise<void> {
        this.closed = true;
        await this.pending;
        await this.summary?.onClose();
        await this.timeline?.onClose();
        // ItemView children own events, observers and Markdown components.
        if (this.summary) this.removeChild(this.summary);
        if (this.timeline) this.removeChild(this.timeline);
    }
}
