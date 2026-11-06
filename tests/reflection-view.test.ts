import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => ({ ItemView: class {}, MarkdownView: class {}, Notice: class {}, TFile: class {}, moment: (await import('moment')).default }));
import { ReflectionView } from '../src/view/reflection-view';

type Entry = { date: string; file: { path: string } | null };
type Anchor = { key: string; offset: number; top: number; day?: string; dayOffset?: number };
interface Harness {
    anchor: Anchor | null; index: Entry[]; visible: Entry[]; sections: Map<string, FakeSection>;
    scroller: { scrollTop: number; clientHeight?: number; style: { setProperty(name: string, value: string): void }; getBoundingClientRect(): { top: number } };
    daysEl: FakeDays; closed: boolean; dirty: Set<string>;
    rebuildIndex(): void; makeDay(day: Entry): Promise<FakeSection>; updateEdges(): void; releaseDay(section: FakeSection): void; syncExpandButton(): void;
    captureAnchor(): Anchor | null; restoreAnchor(anchor: Anchor | null): void;
    extend(direction: number): Promise<void>; refresh(): Promise<void>; jump(date: string): Promise<void>; today(): string;
    dateInput: { value: string; max: string };
    moveDay(direction: -1 | 1): Promise<void>;
    currentDayLabel: { textContent: string };
    syncCurrentDay(): void;
    pending: Promise<void>;
    enqueue(work: () => Promise<void>): Promise<void>;
    setDisplayDate(date: string): Promise<void>;
    pendingDisplayDate: string | null;
    restorePendingDate(): void;
}
class FakeDays {
    items: FakeSection[] = [];
    constructor(readonly view: Harness) {}
    querySelectorAll() { return this.items; }
    empty() { this.items = []; }
    prepend(...items: FakeSection[]) { this.items.unshift(...items); }
    append(...items: FakeSection[]) { this.items.push(...items); }
}
class FakeSection {
    dataset: { anchor: string };
    constructor(readonly date: string, readonly owner: FakeDays, readonly height = 100) { this.dataset = { anchor: date }; }
    getBoundingClientRect() {
        const index = this.owner.items.indexOf(this);
        const top = this.owner.items.slice(0, index).reduce((sum, section) => sum + section.height, 0) - this.owner.view.scroller.scrollTop;
        return { top, bottom: top + this.height };
    }
    querySelector() { return this; }
    remove() { this.owner.items.splice(this.owner.items.indexOf(this), 1); }
    replaceWith(section: FakeSection) { this.owner.items.splice(this.owner.items.indexOf(this), 1, section); }
}
const entry = (n: number): Entry => ({ date: `2026-10-${String(n).padStart(2, '0')}`, file: { path: `${n}.md` } });
function makeView(all: Entry[], shown: Entry[]) {
    const view = Object.create(ReflectionView.prototype) as Harness;
    view.dateInput = { value: '', max: '' };
    view.today = () => '2026-10-31';
    view.anchor = null;
    view.pending = Promise.resolve();
    view.pendingDisplayDate = null;
    view.index = [...all]; view.visible = [...shown]; view.closed = false;
    view.sections = new Map(); view.dirty = new Set();
    view.scroller = { scrollTop: 0, style: { setProperty: vi.fn() }, getBoundingClientRect: () => ({ top: 0 }) };
    view.daysEl = new FakeDays(view);
    for (const day of shown) { const section = new FakeSection(day.date, view.daysEl); view.sections.set(day.date, section); view.daysEl.items.push(section); }
    view.rebuildIndex = () => {};
    view.updateEdges = () => {};
    view.releaseDay = () => {};
    view.syncExpandButton = () => {};
    view.makeDay = day => Promise.resolve(new FakeSection(day.date, view.daysEl));
    return view;
}

describe('reflection viewport continuity', () => {
    beforeEach(() => { vi.stubGlobal('getComputedStyle', () => ({ overflowY: 'auto' })); });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('keeps the restored date pending until plugin CSS makes the view scrollable', async () => {
        const all = [entry(1), entry(10), entry(20), entry(31)];
        const view = makeView(all, all.slice(0, 2));
        view.scroller.clientHeight = 500;
        vi.stubGlobal('getComputedStyle', () => ({ overflowY: 'visible' }));
        await view.setDisplayDate('2026-10-20');
        expect(view.pendingDisplayDate).toBe('2026-10-20');
        expect(view.dateInput.value).toBe('2026-10-20');
        expect(view.scroller.scrollTop).toBe(0);
        vi.stubGlobal('getComputedStyle', () => ({ overflowY: 'auto' }));
        view.restorePendingDate();
        expect(view.pendingDisplayDate).toBeNull();
        expect(view.sections.get('2026-10-20')?.getBoundingClientRect().top).toBe(12);
    });

    it('defers a restored date until the hidden pane has measurable geometry', async () => {
        const all = [entry(1), entry(10), entry(20), entry(31)];
        const view = makeView(all, all.slice(0, 2));
        view.scroller.clientHeight = 0;
        await view.setDisplayDate('2026-10-20');
        expect(view.dateInput.value).toBe('2026-10-20');
        expect(view.pendingDisplayDate).toBe('2026-10-20');
        expect(view.scroller.scrollTop).toBe(0);
        expect(view.anchor).toBeNull();
        view.restorePendingDate();
        expect(view.pendingDisplayDate).toBe('2026-10-20');
        view.scroller.clientHeight = 500;
        view.restorePendingDate();
        expect(view.pendingDisplayDate).toBeNull();
        expect(view.scroller.scrollTop).toBe(188);
        expect(view.scroller.style.setProperty).toHaveBeenCalledWith('--llr-reflection-viewport-height', '500px');
        expect(view.sections.get('2026-10-20')?.getBoundingClientRect().top).toBe(12);
    });

    it('serializes date navigation with later background work until rendering finishes', async () => {
        const view = makeView([entry(1)], [entry(1)]);
        view.dateInput.value = '2026-10-01';
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const visited: string[] = [];
        view.jump = async date => { await gate; view.dateInput.value = date; };
        const navigation = view.setDisplayDate('2026-10-20');
        await Promise.resolve();
        const background = view.enqueue(() => { visited.push(view.dateInput.value); return Promise.resolve(); });
        await Promise.resolve();
        expect(visited).toEqual([]);
        release();
        await Promise.all([navigation, background]);
        expect(visited).toEqual(['2026-10-20']);
    });

    it('waits for initial work even when selecting the already displayed date', async () => {
        const view = makeView([entry(1)], [entry(1)]);
        view.dateInput.value = '2026-10-01';
        let release!: () => void;
        view.pending = new Promise<void>(resolve => { release = resolve; });
        const jump = vi.spyOn(view, 'jump');
        let finished = false;
        const navigation = view.setDisplayDate('2026-10-01').then(() => { finished = true; });
        await Promise.resolve();
        expect(finished).toBe(false);
        release(); await navigation;
        expect(jump).not.toHaveBeenCalled();
    });

    it('reports a failed navigation to its caller and accepts a subsequent retry', async () => {
        const view = makeView([entry(1)], [entry(1)]);
        view.dateInput.value = '2026-10-01';
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        view.jump = vi.fn().mockRejectedValueOnce(new Error('vault unavailable')).mockImplementation(async (date: string) => { view.dateInput.value = date; });
        try {
            await expect(view.setDisplayDate('2026-10-20')).rejects.toThrow('vault unavailable');
            await view.setDisplayDate('2026-10-20');
            expect(view.dateInput.value).toBe('2026-10-20');
        } finally { error.mockRestore(); }
    });

    it('moves by calendar days across gaps and month boundaries', async () => {
        const view = makeView([entry(1), entry(3)], [entry(1), entry(3)]);
        view.jump = vi.fn(() => Promise.resolve());
        view.dateInput.value = '2026-10-03';
        await view.moveDay(-1);
        expect(view.jump).toHaveBeenLastCalledWith('2026-10-02');
        view.dateInput.value = '2026-11-01';
        await view.moveDay(-1);
        expect(view.jump).toHaveBeenLastCalledWith('2026-10-31');
        view.dateInput.value = '2026-10-31';
        await view.moveDay(1);
        expect(view.jump).toHaveBeenLastCalledWith('2026-11-01');
    });
    it('updates the visible day without replacing a date currently being edited', () => {
        const all = [entry(1), entry(2), entry(3)];
        const view = makeView(all, all);
        view.scroller.clientHeight = 100;
        view.currentDayLabel = { textContent: '' };
        const focusedDocument: { activeElement: unknown } = { activeElement: null };
        vi.stubGlobal('document', focusedDocument);
        try {
            view.scroller.scrollTop = 120;
            view.syncCurrentDay();
            expect(view.dateInput.value).toBe('2026-10-02');
            expect(view.currentDayLabel.textContent).toContain('10-02');
            focusedDocument.activeElement = view.dateInput;
            view.dateInput.value = '2026-10-01';
            view.scroller.scrollTop = 220;
            view.syncCurrentDay();
            expect(view.currentDayLabel.textContent).toContain('10-03');
            expect(view.dateInput.value).toBe('2026-10-01');
        } finally { vi.unstubAllGlobals(); }
    });
    it('keeps the reader at their latest position when older days finish loading', async () => {
        const all = Array.from({ length: 10 }, (_, i) => entry(i + 1));
        const view = makeView(all, all.slice(5));
        view.scroller.scrollTop = 120;
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        view.makeDay = async day => { await gate; return new FakeSection(day.date, view.daysEl); };
        const loading = view.extend(-1);
        view.scroller.scrollTop = 230; // user scrolls during vault read
        release(); await loading;
        expect(view.visible).toEqual(all);
        expect(view.scroller.scrollTop).toBe(730);
        expect(view.captureAnchor()?.key).toBe(entry(8).date);
        await view.extend(-1);
        expect(view.visible).toHaveLength(10); // no duplicates at oldest edge
    });

    it('keeps a changed day above the viewport from moving the current day', async () => {
        const all = [entry(1), entry(2), entry(3)];
        const view = makeView(all, all);
        view.scroller.scrollTop = 140;
        view.dirty.add('1.md');
        view.makeDay = day => Promise.resolve(new FakeSection(day.date, view.daysEl, 300));
        await view.refresh();
        expect(view.scroller.scrollTop).toBe(340);
        expect(view.captureAnchor()?.key).toBe(entry(2).date);
    });

    it('retains the saved viewport while the tab is hidden and restores after return', async () => {
        const all = [entry(1), entry(2), entry(3)];
        const view = makeView(all, all);
        view.scroller.scrollTop = 140;
        view.anchor = view.captureAnchor();
        view.scroller.clientHeight = 0;
        view.scroller.scrollTop = 0; // hidden panes can report a zero scroll offset
        view.dirty.add('1.md');
        view.makeDay = day => Promise.resolve(new FakeSection(day.date, view.daysEl, 300));
        await view.refresh();
        expect(view.anchor?.key).toBe(entry(2).date);
        view.scroller.clientHeight = 500;
        view.restoreAnchor(view.anchor);
        expect(view.scroller.scrollTop).toBe(340);
    });

    it('jumps to missing dates without creating a note, reuses loaded days and clamps the future', async () => {
        const all = [entry(1), entry(10), entry(20), entry(31)];
        const view = makeView(all, all.slice(0, 2));
        const read = vi.spyOn(view, 'makeDay');
        await view.jump('2026-10-15');
        expect(view.visible.map(day => day.date)).toContain('2026-10-15');
        expect(view.visible.find(day => day.date === '2026-10-15')?.file).toBeNull();
        expect(view.dateInput.value).toBe('2026-10-15');
        const count = read.mock.calls.length;
        await view.jump('2026-10-10');
        expect(read.mock.calls.length).toBe(count);
        await view.jump('2026-12-01');
        expect(view.dateInput.value).toBe('2026-10-31');
        expect(view.visible.every(day => day.date <= '2026-10-31')).toBe(true);
    });

    it('caps retained day sections and permits removed days to load again', async () => {
        const all = Array.from({ length: 50 }, (_, i): Entry => ({ date: String(i).padStart(3, '0'), file: null }));
        const view = makeView(all, all.slice(10, 45));
        view.scroller.scrollTop = 5;
        await view.extend(-1);
        expect(view.visible).toEqual(all.slice(5, 40));
        expect(view.daysEl.items).toHaveLength(35);
        expect(view.scroller.scrollTop).toBe(505);
        view.scroller.scrollTop = 3200;
        await view.extend(1);
        expect(view.visible).toEqual(all.slice(10, 45));
        expect(view.scroller.scrollTop).toBe(2700);
    });
});
