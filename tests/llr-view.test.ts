// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderer = vi.hoisted(() => {
    class MockView {
        containerEl: HTMLElement;
        contentEl: HTMLElement;
        scrollTop = 0;
        date = '2026-11-05';
        openCount = 0;
        closeCount = 0;
        refresh = vi.fn(async () => {});
        openDateNote = vi.fn(async (_date: string) => {});
        setDate = vi.fn(async (date: string) => { this.date = date; this.scrollTop = 0; });
        constructor(leaf: { containerEl: HTMLElement }) {
            this.containerEl = document.createElement('div');
            this.containerEl.className = 'workspace-leaf-content';
            const header = document.createElement('header');
            header.className = 'view-header';
            this.contentEl = document.createElement('section');
            this.contentEl.className = 'view-content';
            this.containerEl.append(header, this.contentEl);
            leaf.containerEl.append(this.containerEl);
            const control = document.createElement('button');
            control.className = 'llr-display-switch';
            this.contentEl.append(control);
            const scroller = document.createElement('div');
            scroller.className = 'test-scroller';
            this.contentEl.append(scroller);
        }
        async onOpen() { this.openCount++; }
        async onClose() { this.closeCount++; }
        getDisplayDate() { return this.date; }
        setDisplayDate(date: string) { return this.setDate(date); }
        requestRefresh() { return this.refresh(); }
    }
    
    return { MockView, summaryInstances: [] as Array<{ view: MockView; options: Record<string, unknown> }>, timelineInstances: [] as Array<{ view: MockView; onTasks: () => void; openNote: (date: string) => Promise<void> }> };
});
vi.mock('obsidian', () => ({
    ItemView: class {
        containerEl: HTMLElement;
        contentEl: HTMLElement;
        leaf: unknown;
        children: unknown[] = [];
        constructor(leaf: { containerEl: HTMLElement }) { this.leaf = leaf; this.containerEl = document.createElement('div'); this.contentEl = document.createElement('div'); this.containerEl.append(this.contentEl); leaf.containerEl.append(this.containerEl); }
        addChild<T>(child: T) { this.children.push(child); return child; }
        removeChild(child: unknown) { this.children = this.children.filter(item => item !== child); }
        onPaneMenu() {}
        async setState() {}
    },
    Menu: class {},
    Notice: class {},
}));
vi.mock('../src/view/summary-view', () => ({
    VIEW_TYPE_SUMMARY: 'llr-summary-view',
    SummaryView: class extends renderer.MockView {
        constructor(leaf: { containerEl: HTMLElement }, options: Record<string, unknown>) {
            super(leaf); renderer.summaryInstances.push({ view: this, options });
        }
    },
}));
vi.mock('../src/view/reflection-view', () => ({
    ReflectionView: class extends renderer.MockView {
        constructor(leaf: { containerEl: HTMLElement }, _settings: () => unknown, onTasks: () => void, openNote: (date: string) => Promise<void>) {
            super(leaf); renderer.timelineInstances.push({ view: this, onTasks, openNote });
        }
    },
}));

import type { WorkspaceLeaf } from 'obsidian';
import { LlrView } from '../src/view/llr-view';

type Harness = {
    containerEl: HTMLElement;
    contentEl: HTMLElement;
    mode: 'tasks' | 'timeline';
    summary: InstanceType<typeof renderer.MockView>;
    timeline: InstanceType<typeof renderer.MockView> | null;
    pending: Promise<void>;
    onOpen(): Promise<void>;
    onClose(): Promise<void>;
    showMode(mode: 'tasks' | 'timeline', date?: string, focusSwitch?: boolean): Promise<void>;
    getViewType(): string;
    getDisplayText(): string;
    getState(): Record<string, unknown>;
    setState(state: unknown, result: never): Promise<void>;
    requestRefresh(): Promise<void>;
}

const settings = { enabled: true, folder: '', format: 'YYYY-MM-DD' };
function setup() {
    renderer.summaryInstances = [];
    renderer.timelineInstances = [];
    const delegate = {
        getRoutineFolder: () => 'routine',
        getSectionBoundaries: (): Array<{ value: number; label: string }> => [],
        getDailyNoteSettings: vi.fn(() => settings),
    };
    const leafHost = document.createElement('div');
    leafHost.className = 'workspace-leaf';
    const leaf = { containerEl: leafHost };
    const view = new LlrView(leaf as unknown as WorkspaceLeaf, delegate) as unknown as Harness;
    document.body.replaceChildren(leafHost);
    expect(leafHost.children).toHaveLength(1);
    return { view, delegate };
}

describe('unified LLR view', () => {
    beforeEach(() => {
        document.body.replaceChildren();
        Object.assign(HTMLElement.prototype, {
            empty(this: HTMLElement) { this.replaceChildren(); },
            addClass(this: HTMLElement, value: string) { this.classList.add(value); },
        });
    });

    it('opens the existing task renderer by default without creating the timeline', async () => {
        const { view } = setup();
        await view.onOpen();
        expect(view.getViewType()).toBe('llr-summary-view');
        expect(view.getDisplayText()).toBe('LLR');
        expect(view.mode).toBe('tasks');
        expect(view.contentEl.dataset.mode).toBeUndefined();
        expect(view.summary.openCount).toBe(1);
        expect(view.contentEl.contains(view.summary.contentEl)).toBe(true);
        expect(view.containerEl.contains(view.summary.containerEl)).toBe(false);
        expect(view.summary.containerEl.parentElement).toBeNull();
        expect(view.containerEl.parentElement?.children).toHaveLength(1);
        expect(view.timeline).toBeNull();
        expect(renderer.timelineInstances).toHaveLength(0);
    });

    it('opens the timeline date through the existing summary note route without switching views', async () => {
        const { view } = setup();
        await view.onOpen();
        await view.showMode('timeline', '2026-11-05');
        await renderer.timelineInstances[0].openNote('2026-11-04');
        expect(view.summary.openDateNote).toHaveBeenCalledWith('2026-11-04');
        expect(view.mode).toBe('timeline');
    });

    it('creates the timeline once and switches back through the existing header switch', async () => {
        const { view } = setup();
        await view.onOpen();
        await view.showMode('timeline', '2026-11-05');
        expect(view.mode).toBe('timeline');
        expect(view.timeline?.openCount).toBe(1);
        expect(view.summary.contentEl.hidden).toBe(true);
        expect(view.timeline?.contentEl.hidden).toBe(false);
        expect(view.timeline?.containerEl.parentElement).toBeNull();
        expect(view.containerEl.parentElement?.children).toHaveLength(1);
        expect(view.contentEl.dataset.mode).toBe('timeline');

        renderer.timelineInstances[0].onTasks();
        await view.pending;
        expect(view.mode).toBe('tasks');
        expect(view.timeline?.openCount).toBe(1);
        expect(renderer.timelineInstances).toHaveLength(1);
        expect(view.summary.contentEl.hidden).toBe(false);
        expect(view.timeline?.contentEl.hidden).toBe(true);
    });

    it('keeps each mode state when returning to the same day and synchronizes dates after navigation', async () => {
        const { view } = setup();
        await view.onOpen();
        view.summary.scrollTop = 140;
        await view.showMode('timeline', '2026-11-05');
        const timeline = view.timeline!;
        timeline.scrollTop = 220;
        timeline.date = '2026-11-06';

        await view.showMode('tasks');
        expect(view.summary.date).toBe('2026-11-06');
        // A different day starts at its beginning, as the real SummaryView does.
        expect(view.summary.scrollTop).toBe(0);
        expect(timeline.scrollTop).toBe(220);

        await view.showMode('timeline');
        expect(timeline.date).toBe('2026-11-06');
        expect(timeline.setDate).not.toHaveBeenCalled();
        expect(timeline.scrollTop).toBe(220);

        await view.showMode('tasks');
        view.summary.date = '2026-11-07';
        await view.showMode('timeline');
        expect(timeline.date).toBe('2026-11-07');
        expect(timeline.setDate).toHaveBeenCalledWith('2026-11-07');
    });

    it('preserves each scroll position on a same-day round trip', async () => {
        const { view } = setup();
        await view.onOpen();
        view.summary.scrollTop = 140;
        await view.showMode('timeline');
        const timeline = view.timeline!;
        timeline.scrollTop = 220;
        await view.showMode('tasks');
        expect(view.summary.scrollTop).toBe(140);
        await view.showMode('timeline');
        expect(timeline.scrollTop).toBe(220);
    });

    it('restores the previous mode after a failed switch and allows retry', async () => {
        const { view } = setup();
        await view.onOpen();
        await view.showMode('timeline');
        await view.showMode('tasks');
        view.summary.date = '2026-11-06';
        view.timeline!.setDate.mockRejectedValueOnce(new Error('read failed'));
        await expect(view.showMode('timeline')).rejects.toThrow('read failed');
        expect(view.mode).toBe('tasks');
        expect(view.summary.contentEl.hidden).toBe(false);
        expect(view.timeline!.contentEl.hidden).toBe(true);
        await view.showMode('timeline');
        expect(view.mode).toBe('timeline');
        expect(view.timeline!.date).toBe('2026-11-06');
    });

    it('releases an unsuccessfully initialized timeline before a later retry', async () => {
        const { view } = setup();
        await view.onOpen();
        const open = vi.spyOn(renderer.MockView.prototype, 'onOpen').mockRejectedValueOnce(new Error('open failed'));
        try {
            await expect(view.showMode('timeline')).rejects.toThrow('open failed');
            const failed = renderer.timelineInstances[0].view;
            expect(failed.closeCount).toBe(1);
            expect(failed.contentEl.isConnected).toBe(false);
            expect(view.timeline).toBeNull();
            expect(view.summary.contentEl.hidden).toBe(false);
            await view.showMode('timeline');
            expect(renderer.timelineInstances).toHaveLength(2);
            expect(view.mode).toBe('timeline');
        } finally { open.mockRestore(); }
    });

    it('serializes quick requests and leaves focus on the switch control', async () => {
        const { view } = setup();
        await view.onOpen();
        const first = view.showMode('timeline', undefined, true);
        const second = view.showMode('tasks', undefined, true);
        await Promise.all([first, second, view.pending]);
        expect(view.mode).toBe('tasks');
        expect(document.activeElement).toBe(view.summary.contentEl.querySelector('.llr-display-switch'));
    });

    it('persists active mode and date and delegates refresh to the task renderer', async () => {
        const { view } = setup();
        await view.onOpen();
        await view.showMode('timeline', '2026-11-05');
        expect(view.getState()).toEqual({ displayMode: 'timeline', date: '2026-11-05' });
        await view.requestRefresh();
        expect(view.summary.refresh).toHaveBeenCalledOnce();
    });

    it('restores the selected mode and date from saved workspace state', async () => {
        const { view } = setup();
        await view.onOpen();
        await view.setState({ displayMode: 'timeline', date: '2026-11-04' }, {} as never);
        expect(view.mode).toBe('timeline');
        expect(view.timeline?.date).toBe('2026-11-04');
        expect(view.timeline?.contentEl.hidden).toBe(false);
        expect(view.timeline?.containerEl.parentElement).toBeNull();
        expect(view.containerEl.parentElement?.children).toHaveLength(1);
        expect(view.getState()).toEqual({ displayMode: 'timeline', date: '2026-11-04' });
    });

    it('closes mounted renderers once and does not create an unused timeline on close', async () => {
        const { view } = setup();
        await view.onOpen();
        await view.onClose();
        expect(view.summary.closeCount).toBe(1);
        expect(view.timeline).toBeNull();
        expect(renderer.timelineInstances).toHaveLength(0);

        const other = setup().view;
        await other.onOpen();
        await other.showMode('timeline');
        await other.onClose();
        expect(other.summary.closeCount).toBe(1);
        expect(other.timeline?.closeCount).toBe(1);
    });
});
