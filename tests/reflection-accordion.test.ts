// @vitest-environment happy-dom
// DOM behavior only: happy-dom does not validate CSS geometry or native Markdown.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { moment, TFile, type Component, type WorkspaceLeaf } from 'obsidian';
import { buildReflectionTimeline, type ReflectionBlock, type ReflectionTask } from '../src/service/reflection-timeline';
import { ReflectionExpansionState } from '../src/service/reflection-expansion';

vi.mock('obsidian', async () => {
    class ComponentStub {
        children: ComponentStub[] = [];
        addChild(child: ComponentStub) { this.children.push(child); return child; }
        removeChild(child: ComponentStub) { this.children = this.children.filter(item => item !== child); }
        registerDomEvent(element: HTMLElement, name: string, callback: EventListener) { element.addEventListener(name, callback); }
        register() {}
        registerEvent() {}
        // These DOM tests do not advance time; dispose registered intervals.
        registerInterval(id: number) { window.clearInterval(id); return id; }
    }
    return {
        Component: ComponentStub,
        ItemView: class extends ComponentStub {
            contentEl = document.createElement('div');
            app = {
                workspace: { openLinkText: vi.fn(), on: vi.fn() },
                vault: { cachedRead: vi.fn(), getMarkdownFiles: vi.fn(() => []), on: vi.fn() },
            };
            onPaneMenu() {}
        },
        TFile: class {}, Notice: class {}, Platform: { isMobile: false },
        moment: (await import('moment')).default,
        setTooltip: (el: HTMLElement, title: string) => { el.title = title; },
        setIcon: (el: HTMLElement, icon: string) => { el.dataset.icon = icon; },
        MarkdownRenderer: {
            render: (_app: unknown, markdown: string, host: HTMLElement) => {
                const paragraph = document.createElement('p');
                const linkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
                let cursor = 0;
                for (const match of markdown.matchAll(linkPattern)) {
                    const index = match.index ?? 0;
                    paragraph.append(document.createTextNode(markdown.slice(cursor, index)));
                    const link = document.createElement('a');
                    link.className = 'internal-link';
                    link.dataset.href = match[1];
                    link.href = match[1];
                    link.textContent = match[2] ?? match[1];
                    paragraph.append(link);
                    cursor = index + match[0].length;
                }
                paragraph.append(document.createTextNode(markdown.slice(cursor)));
                host.append(paragraph);
                return Promise.resolve();
            },
        },
    };
});
import { Component as RuntimeComponent } from 'obsidian';
import { ReflectionView } from '../src/view/reflection-view';

type Options = string | { cls?: string; text?: string; attr?: Record<string, string> };
function create(this: HTMLElement, tag: string, options: Options = {}) {
    const props = typeof options === 'string' ? { cls: options } : options;
    const el = document.createElement(tag);
    if (props.cls) el.className = props.cls;
    if (props.text !== undefined) el.textContent = props.text;
    Object.entries(props.attr ?? {}).forEach(([key, value]) => el.setAttribute(key, value));
    this.append(el);
    return el;
}
beforeEach(() => {
    document.body.replaceChildren();
    Object.assign(HTMLElement.prototype, {
        createEl: create,
        createDiv(this: HTMLElement, options: Options) { return create.call(this, 'div', options); },
        createSpan(this: HTMLElement, options: Options) { return create.call(this, 'span', options); },
        empty(this: HTMLElement) { this.replaceChildren(); },
        addClass(this: HTMLElement, cls: string) { this.classList.add(cls); },
        toggleClass(this: HTMLElement, cls: string, on: boolean) { this.classList.toggle(cls, on); },
    });
});
type Day = { date: string; file: { path: string } | null };
const day: Day = { date: '2026-11-05', file: null };
const record = (title = 'Lunch'): ReflectionTask => ({
    id: 0, kind: 'task', line: 0, sourceLine: 1, status: 'x', title, isPlanned: false,
    actualStart: '12:00', actualEnd: '14:18', startMinute: 720, endMinute: 858,
    source: '', supplement: 'Read the memo without closing it.', supplements: '',
});
const block = (start = 720, title = 'Lunch'): ReflectionBlock => ({
    id: start, title, startMinute: start, endMinute: start + 180, tasks: [record(title)],
});
interface Harness {
    contentEl: HTMLElement; scroller: HTMLElement; daysEl: HTMLElement; expandButton: HTMLButtonElement;
    pending: Promise<void>; expansion: ReflectionExpansionState; userScrollRevision: number;
    dateInput: HTMLInputElement;
    visible: Day[]; sections: Map<string, HTMLElement>;
    app: { vault: { cachedRead: ReturnType<typeof vi.fn> }; workspace: { openLinkText: ReturnType<typeof vi.fn> }; metadataCache?: unknown };
    makeBlock(parent: HTMLElement, day: Day, block: ReflectionBlock, occurrence: number, component: Component): Promise<void>;
    makeDay(day: Day): Promise<HTMLElement>;
    setAllDetails(open: boolean): Promise<void>;
    captureAnchor(): null; restoreAnchor(anchor: unknown): void;
    updateEdges(): void; jump(date: string): Promise<void>; today(): string;
    renderMarkdown(host: HTMLElement, markdown: string, day: Day, component: Component): Promise<void>;
    syncCurrentDay(): void;
    openNoteButton: HTMLButtonElement | null;
    pendingDisplayDate: string | null;
    onOpen(): Promise<void>;
    onClose(): Promise<void>;
    releaseDay(section: HTMLElement): void;
    detailSetters: Map<HTMLDetailsElement, { setOpen(open: boolean): Promise<void> }>;
}
async function setup(getSectionBoundaries?: () => { value: number; label: string }[]) {
    const view = new ReflectionView({} as WorkspaceLeaf, () => ({ enabled: true, folder: '', format: 'YYYY-MM-DD' }), undefined, undefined, undefined, undefined, undefined, getSectionBoundaries) as unknown as Harness;
    view.scroller = document.createElement('div');
    view.daysEl = view.scroller.createDiv();
    view.expandButton = document.createElement('button');
    view.contentEl.append(view.scroller, view.expandButton);
    document.body.append(view.contentEl);
    view.dateInput = document.createElement('input');
    view.dateInput.value = day.date;
    view.today = () => day.date;
    const component = new RuntimeComponent();
    await view.makeBlock(view.daysEl, day, block(), 0, component);
    return { view, component, summary: view.daysEl.querySelector('summary')!, details: view.daysEl.querySelector('details')! };
}

describe('reflection accordion source DOM behavior', () => {
    it('keeps malformed clock tokens readable in an expandable record', async () => {
        const { view, component } = await setup();
        view.daysEl.empty();
        const task: ReflectionTask = { ...record('スポンジ交換'), actualStart: '', actualEnd: '', rawActualTime: '99:99 - 99:99', startMinute: null, endMinute: null, supplement: '', supplements: '' };
        await view.makeBlock(view.daysEl, day, { ...block(), title: task.title, startMinute: null, endMinute: null, tasks: [task] }, 0, component);
        view.daysEl.querySelector('summary')!.click(); await view.pending;
        expect(view.daysEl.querySelector('.llr-reflection-record-time')?.textContent).toBe('99:99 - 99:99');
    });
    it.each([
        ['x', '14:18', '12:00–14:18'],
        ['x', '12:00', '12:00'],
        ['/', '', '12:00'],
    ] as const)('exposes recorded times for a lone %s record ending %s without a memo', async (status, actualEnd, expected) => {
        const { view, component } = await setup();
        view.daysEl.empty();
        const task = { ...record('昼ごはん'), status, actualEnd, supplement: '', supplements: '' };
        await view.makeBlock(view.daysEl, day, { ...block(720, task.title), tasks: [task] }, 0, component);
        const summary = view.daysEl.querySelector('summary');
        expect(summary).not.toBeNull();
        summary!.click(); await view.pending;
        expect(view.daysEl.querySelector('.llr-reflection-record-time')?.textContent).toBe(expected);
    });
    it('renders a lone plan without a disclosure, retaining its title link', async () => {
        const { view, component } = await setup();
        view.daysEl.empty();
        const task = { ...record('[[音楽練習]]'), status: ' ' as const, isPlanned: true, actualStart: '', actualEnd: '', supplement: '', supplements: '' };
        await view.makeBlock(view.daysEl, day, { ...block(1260, task.title), isPlanned: true, tasks: [task] }, 0, component);
        expect(view.daysEl.querySelector('details')).toBeNull();
        expect(view.daysEl.querySelector('.llr-reflection-disclosure-icon')).toBeNull();
        view.daysEl.querySelector<HTMLAnchorElement>('a')!.click();
        expect(view.app.workspace.openLinkText).toHaveBeenCalledWith('音楽練習', '', 'tab');
        const hidden = { ...task, id: 1, title: '隠れた項目' };
        view.daysEl.empty();
        await view.makeBlock(view.daysEl, day, { ...block(1260, task.title), isPlanned: true, tasks: [task, hidden] }, 0, component);
        expect(view.daysEl.querySelector('details')).not.toBeNull();
    });
    it('opens inline with the record title and closes only from its heading', async () => {
        const { view, summary, details } = await setup();
        expect(details.open).toBe(false);
        expect(view.daysEl.querySelector('.llr-reflection-record')).toBeNull();
        summary.click(); await view.pending;
        expect(details.open).toBe(true);
        expect(summary.getAttribute('aria-expanded')).toBe('true');
        expect(view.daysEl.querySelector('.llr-reflection-record-title')?.textContent).toBe(summary.querySelector('.llr-reflection-name')?.textContent);
        expect(view.daysEl.querySelector('.llr-reflection-record-time')?.textContent).toBe('12:00–14:18');
        view.daysEl.querySelector<HTMLElement>('.llr-reflection-supplement')!.click(); await view.pending;
        expect(details.open).toBe(true);
        summary.click(); await view.pending;
        expect(details.open).toBe(false);
        expect(view.daysEl.querySelector('.llr-reflection-record')).toBeNull();
    });
    it('opens a collapsed activity from its whole face and serializes repeated clicks', async () => {
        const { view, summary, details } = await setup();
        view.daysEl.querySelector<HTMLElement>('.llr-reflection-row')!.click(); await view.pending;
        expect(details.open).toBe(true);
        summary.click(); summary.click(); await view.pending;
        expect(details.open).toBe(true);
        expect(view.daysEl.querySelectorAll('.llr-reflection-record')).toHaveLength(1);
    });
    it('keeps the linked title in both the activity heading and its first record', async () => {
        const { view, component } = await setup();
        await view.makeBlock(view.daysEl, day, block(960, '[[Reference|Reading]]'), 0, component);
        const heading = view.daysEl.querySelector<HTMLAnchorElement>('.llr-reflection-name a');
        expect(heading?.textContent).toBe('Reading');
        expect(heading?.getAttribute('data-href')).toBe('Reference');
        await view.setAllDetails(true);
        const recordLink = view.daysEl.querySelector('.llr-reflection-record-title a');
        expect(recordLink?.textContent).toBe('Reading');
        expect(recordLink?.getAttribute('data-href')).toBe('Reference');
        expect(view.app.workspace.openLinkText).not.toHaveBeenCalled();
    });
    it('opens the linked title without toggling a closed or open activity', async () => {
        const { view } = await setup();
        const component = new RuntimeComponent();
        view.daysEl.empty();
        await view.makeBlock(view.daysEl, day, block(720, '[[Reference|Reading]]'), 0, component);
        const heading = view.daysEl.querySelector<HTMLAnchorElement>('.llr-reflection-name a')!;
        const linkedSummary = heading.closest('summary')!;
        const linkedDetails = linkedSummary.parentElement as HTMLDetailsElement;

        heading.click();
        expect(view.app.workspace.openLinkText).toHaveBeenCalledWith('Reference', '', 'tab');
        expect(linkedDetails.open).toBe(false);

        linkedSummary.click();
        await view.pending;
        expect(linkedDetails.open).toBe(true);
        heading.click();
        expect(linkedDetails.open).toBe(true);
        expect(view.app.workspace.openLinkText).toHaveBeenCalledTimes(2);
    });
    it('preserves multiple title links and navigates each one independently', async () => {
        const { view, component } = await setup();
        view.daysEl.empty();
        await view.makeBlock(view.daysEl, day, block(720, '[[First|One]] and [[Second|Two]]'), 0, component);
        const links = Array.from(view.daysEl.querySelectorAll<HTMLAnchorElement>('.llr-reflection-name a'));
        expect(links.map(link => link.textContent)).toEqual(['One', 'Two']);
        links[0].click();
        links[1].click();
        expect(view.app.workspace.openLinkText.mock.calls.map((call: unknown[]) => call[0])).toEqual(['First', 'Second']);
    });
    it('keeps an unlinked activity title as plain text', async () => {
        const { view } = await setup();
        expect(view.daysEl.querySelector('.llr-reflection-name')?.textContent).toBe('Lunch');
        expect(view.daysEl.querySelector('.llr-reflection-name a')).toBeNull();
    });
    it('leaves an external heading link uncancelled and does not toggle its activity', async () => {
        const { view, details } = await setup();
        const heading = view.daysEl.querySelector('.llr-reflection-name')!;
        const external = document.createElement('a');
        external.href = 'https://example.com';
        external.textContent = 'External';
        heading.append(external);
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });

        external.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(details.open).toBe(false);
        await view.pending;
        expect(details.open).toBe(false);
    });
    it('shows a zero-minute record time once', async () => {
        const { view, component } = await setup();
        view.daysEl.empty();
        const zero = { ...record('Point'), actualStart: '12:00', actualEnd: '12:00', startMinute: 720, endMinute: 720 };
        await view.makeBlock(view.daysEl, day, { id: 720, title: 'Point', startMinute: 720, endMinute: 720, tasks: [zero] }, 0, component);
        await view.setAllDetails(true);
        expect(view.daysEl.querySelector('.llr-reflection-record-time')?.textContent).toBe('12:00');
    });
    it('hides only untimed records while preserving them in parsed timeline data and keeping timed zero-minute items', async () => {
        const markdown = [
            '## Morning',
            '- [x] Untimed journal item',
            '## Noon',
            '- [x] Point record 12:00 - 12:00',
        ].join('\n');
        const timeline = buildReflectionTimeline(markdown);
        expect(timeline.tasks.map(task => [task.title, task.startMinute, task.endMinute])).toContainEqual(['Untimed journal item', null, null]);
        expect(timeline.blocks.some(item => item.startMinute === null && item.endMinute === null)).toBe(true);

        const view = new ReflectionView({} as WorkspaceLeaf, () => ({ enabled: true, folder: '', format: 'YYYY-MM-DD' })) as unknown as Harness;
        view.app.vault.cachedRead.mockResolvedValue(markdown);
        const rendered = await view.makeDay({ date: day.date, file: { path: 'daily/2026-11-05.md' } });

        expect(rendered.querySelector('.llr-reflection-untimed')).toBeNull();
        expect(rendered.textContent).not.toContain('Untimed journal item');
        expect(rendered.querySelector('.llr-reflection-row.is-time-band')).not.toBeNull();
        expect(rendered.textContent).toContain('Point record');
    });
    it('places the disclosure icon after the name and updates the expanded state', async () => {
        const { view, summary, details } = await setup();
        const name = summary.querySelector('.llr-reflection-name');
        const icon = summary.querySelector('.llr-reflection-disclosure-icon');
        expect(icon).not.toBeNull();
        expect(icon?.getAttribute('aria-hidden')).toBe('true');
        expect(icon?.getAttribute('data-icon')).toBe('chevron-down');
        expect(Array.from(summary.children).indexOf(icon!)).toBeGreaterThan(Array.from(summary.children).indexOf(name!));
        expect(summary.getAttribute('aria-expanded')).toBe('false');

        summary.click(); await view.pending;
        expect(summary.getAttribute('aria-expanded')).toBe('true');
        expect(details.open).toBe(true);
    });
    it('opens the note for the day currently tracked by timeline scrolling', async () => {
        const openDateNote = vi.fn(async (_date: string) => {});
        const view = new ReflectionView({} as WorkspaceLeaf, () => ({ enabled: true, folder: '', format: 'YYYY-MM-DD' }), () => {}, openDateNote) as unknown as Harness;
        await view.onOpen();
        view.pendingDisplayDate = null;
        const scroller = view.scroller;
        vi.spyOn(scroller, 'clientHeight', 'get').mockReturnValue(400);
        vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
        const earlier: Day = { date: '2026-11-10', file: null };
        const displayed: Day = { date: '2026-11-09', file: null };
        view.visible = [earlier, displayed];
        const earlierSection = document.createElement('section');
        const displayedSection = document.createElement('section');
        vi.spyOn(earlierSection, 'getBoundingClientRect').mockReturnValue({ bottom: 110 } as DOMRect);
        vi.spyOn(displayedSection, 'getBoundingClientRect').mockReturnValue({ bottom: 180 } as DOMRect);
        view.sections = new Map([[earlier.date, earlierSection], [displayed.date, displayedSection]]);

        view.syncCurrentDay();
        view.openNoteButton?.click();

        expect(openDateNote).toHaveBeenCalledWith(displayed.date);
        expect(view.dateInput.value).toBe(displayed.date);
        await view.onClose();
    });
    it('keeps the bulk control disabled while an async expansion is running', async () => {
        const { view } = await setup();
        const button = document.createElement('button');
        view.expandButton = button;
        let release!: () => void;
        view.renderMarkdown = async () => await new Promise<void>(resolve => { release = resolve; });

        const operation = view.setAllDetails(true);
        expect(button.disabled).toBe(true);
        release();
        await operation;
        expect(button.disabled).toBe(false);
    });
    it('supports mixed individual/bulk states and new activities inherit the bulk default', async () => {
        const { view, component, summary, details } = await setup();
        await view.setAllDetails(true);
        await view.makeBlock(view.daysEl, day, block(960, 'Later'), 0, component);
        expect(Array.from(view.daysEl.querySelectorAll('details')).every(item => item.open)).toBe(true);
        summary.click(); await view.pending;
        expect(details.open).toBe(false);
        expect(view.expandButton.getAttribute('aria-label')).toBe('すべて展開');
        await view.setAllDetails(true);
        expect(view.expandButton.getAttribute('aria-label')).toBe('すべて折りたたむ');
        await view.setAllDetails(false);
        expect(Array.from(view.daysEl.querySelectorAll('details')).every(item => !item.open)).toBe(true);
    });
    it('honors manual scroll intent during async Markdown rendering', async () => {
        const { view, summary } = await setup();
        const render = view.renderMarkdown.bind(view);
        view.renderMarkdown = async (...args) => { view.userScrollRevision++; await render(...args); };
        view.restoreAnchor = vi.fn();
        summary.click(); await view.pending;
        expect(view.restoreAnchor).not.toHaveBeenCalled();
    });
});

describe('section-anchored planned clock display', () => {
    it('shows the original planned clock in the existing title without adding disclosure', async () => {
        const { view, component } = await setup();
        view.daysEl.replaceChildren();
        const task = { ...record('[[Dinner]]'), status: ' ' as const, isPlanned: true,
            plannedStart: '17:50', actualStart: '', actualEnd: '', supplement: '', startMinute: 1080, endMinute: 1150 };
        await view.makeBlock(view.daysEl, day, { id: 0, title: task.title, startMinute: 1080,
            endMinute: 1140, isPlanned: true, plannedStart: task.plannedStart, tasks: [task] }, 0, component);
        expect(view.daysEl.textContent).toContain('17:50 Dinner');
        expect(view.daysEl.querySelector('details')).toBeNull();
        expect(view.daysEl.querySelector('a')?.dataset.href).toBe('Dinner');
    });
});

describe('timeline resolves linked routine frontmatter', () => {
    it('resolves routine sections for today while retaining source clocks and completed actual times', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 10, 5, 16, 0));
        try {
            const boundaries = [
                { value: 1730, label: '夕方' }, { value: 1800, label: '晩ごはん' },
                { value: 2100, label: '夜' }, { value: 2359, label: '深夜' },
            ];
            const { view } = await setup(() => boundaries);
            const dailyFile = new TFile() as TFile & { path: string };
            dailyFile.path = 'daily/2026-11-05.md';
            const dinnerFile = new TFile() as TFile & { path: string };
            dinnerFile.path = 'routine/Dinner.md';
            const reminderFile = new TFile() as TFile & { path: string };
            reminderFile.path = 'routine/Bedroom.md';
            const completedFile = new TFile() as TFile & { path: string };
            completedFile.path = 'routine/Completed.md';
            const files = new Map([
                ['Dinner', { file: dinnerFile, frontmatter: { start: 1750, section: 1800 } }],
                ['Bedroom', { file: reminderFile, frontmatter: { start: 2045, section: 2100 } }],
                ['Completed', { file: completedFile, frontmatter: { start: 900, section: 900 } }],
            ]);
            const lookup = vi.fn((link: string) => files.get(link)?.file ?? null);
            const getCache = vi.fn((file: TFile) => [...files.values()].find(item => item.file === file) ?? null);
            Object.assign(view.app, {
                metadataCache: { getFirstLinkpathDest: lookup, getFileCache: getCache },
                vault: { cachedRead: vi.fn(async () => [
                    '# 夕方',
                    '- [ ] 🥢 [[Dinner]] (70m)',
                    '# 晩ごはん',
                    '- [ ] 17:50 🥢 [[Dinner]] (70m)',
                    '- [ ] 20:45 🦁 [[Bedroom]] (15m)',
                    '# 夜',
                    '- [ ] 🎹 音楽 (60m)',
                    '- [x] [[Completed]] 09:10 - 09:25',
                ].join('\n')) },
            });
            const section = await view.makeDay({ date: moment().format('YYYY-MM-DD'), file: dailyFile });
            const rows = Array.from(section.querySelectorAll('.llr-reflection-row'));
            const rowWith = (text: string) => rows.find(row => row.textContent?.includes(text));
            const dinner = rowWith('17:50 🥢');
            const reminder = rowWith('20:45 🦁');
            expect(dinner).toBeDefined();
            expect(reminder).toBeDefined();
            expect(dinner?.querySelector('.llr-reflection-axis-tick')?.getAttribute('data-minute')).toBe('1080');
            expect(reminder?.querySelector('.llr-reflection-axis-tick')?.getAttribute('data-minute')).toBe('1260');
            expect(dinner?.querySelector('.llr-reflection-name')?.textContent).toContain('17:50');
            expect(reminder?.querySelector('.llr-reflection-name')?.textContent).toContain('20:45');
            const completed = rowWith('Completed');
            expect(completed).toBeDefined();
            expect(completed?.querySelector('.llr-reflection-axis-tick')?.getAttribute('data-minute')).toBe('540');
            expect(lookup).toHaveBeenCalledWith('Dinner', dailyFile.path);
            expect(lookup).toHaveBeenCalledWith('Bedroom', dailyFile.path);
            const original: string = await view.app.vault.cachedRead.mock.results[0].value;
            expect(view.app.vault.cachedRead).toHaveBeenCalledWith(dailyFile);
            expect(original).toContain('- [ ] 17:50 🥢 [[Dinner]] (70m)');
            view.releaseDay(section);
        } finally {
            vi.useRealTimers();
        }
    });

    it('recognizes long sleep only from linked routine metadata on past days', async () => {
        const { view } = await setup(() => [{ value: 600, label: '朝' }, { value: 2400, label: '睡眠' }]);
        const dailyFile = new TFile() as TFile & { path: string };
        dailyFile.path = 'daily/2026-11-04.md';
        const sleepFile = new TFile() as TFile & { path: string };
        sleepFile.path = 'routine/Sleep.md';
        const normalFile = new TFile() as TFile & { path: string };
        normalFile.path = 'routine/Work.md';
        const files = new Map([
            ['Sleep', { file: sleepFile, frontmatter: { summary_role: 'sleep' } }],
            ['Work', { file: normalFile, frontmatter: {} }],
        ]);
        const lookup = vi.fn((link: string) => files.get(link)?.file ?? null);
        const getCache = vi.fn((file: TFile) => [...files.values()].find(item => item.file === file) ?? null);
        Object.assign(view.app, {
            metadataCache: { getFirstLinkpathDest: lookup, getFileCache: getCache },
            vault: { cachedRead: vi.fn(async () => [
                '- [x] [[Sleep]] 20:00 - 09:00',
                '- [x] [[Work]] 20:00 - 09:00',
            ].join('\n')) },
        });
        const section = await view.makeDay({ date: '2026-11-04', file: dailyFile });
        const details = Array.from(section.querySelectorAll('details'));
        expect(lookup).toHaveBeenCalledWith('Sleep', dailyFile.path);
        expect(lookup).toHaveBeenCalledWith('Work', dailyFile.path);
        expect(details.length).toBe(1);
        const row = details[0].closest<HTMLElement>('.llr-reflection-row')!;
        expect(row.style.minHeight).toContain('7 * var(--llr-reflection-hour-height)');
        await view.detailSetters.get(details[0])?.setOpen(true);
        expect(row.textContent).toContain('20:00–09:00');
        expect(row.textContent).toContain('Sleep');
        expect(row.textContent).toContain('Work');
        view.releaseDay(section);
    });
});


describe('planned expansion order', () => {
    it('shows candidates in source order and retains the link of a later representative', async () => {
        const { view, component } = await setup();
        view.daysEl.replaceChildren();
        const plans = buildReflectionTimeline('# 夜\n- [ ] 22:30 [[hidden]] (5m)\n- [ ] [[zero]]\n- [ ] [[music]] (180m)', 3,
            { sections: [{ value: 2100, label: '夜' }, { value: 2359, label: '深夜' }], isSleep: () => false }, 1200);
        await view.makeBlock(view.daysEl, day, plans.blocks[0], 0, component);
        view.daysEl.querySelector('summary')!.click();
        await view.pending;
        const records = Array.from(view.daysEl.querySelectorAll('.llr-reflection-record'));
        expect(records).toHaveLength(3);
        expect(records[0].textContent).toContain('22:30 hidden');
        expect(records[1].textContent).toContain('zero');
        expect(records[2].querySelector('.llr-reflection-record-title a')?.getAttribute('data-href')).toBe('music');
        expect(view.daysEl.querySelectorAll('a[data-href="music"]')).toHaveLength(2);
    });
});

describe('future daily note timeline plans', () => {
    it('keeps future sections visible independently of the current clock and uses linked section metadata', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 10, 5, 16, 0));
        let section: HTMLElement | undefined;
        let view: Harness | undefined;
        try {
            const boundaries = [
                { value: 600, label: '朝' }, { value: 900, label: '午前' },
                { value: 1100, label: '昼' }, { value: 1330, label: '午後' },
                { value: 1730, label: '夕方' }, { value: 1800, label: '晩ごはん' },
                { value: 2100, label: '夜' }, { value: 2359, label: '深夜' },
                { value: 2400, label: '睡眠' },
            ];
            ({ view } = await setup(() => boundaries));
            const dailyFile = new TFile() as TFile & { path: string };
            dailyFile.path = 'daily/2026-11-06.md';
            const linked = new Map<string, { file: TFile; frontmatter: Record<string, unknown> }>();
            const addRoutine = (name: string, frontmatter: Record<string, unknown>) => {
                const file = new TFile() as TFile & { path: string };
                file.path = `routine/${name}.md`;
                linked.set(name, { file, frontmatter });
            };
            addRoutine('Breakfast', { section: 600, estimate: 30 });
            addRoutine('Dinner', { start: 1750, section: 1800, estimate: 70 });
            addRoutine('Bedroom', { start: 2045, section: 2100, estimate: 15 });
            addRoutine('Sleep', { section: 2400, estimate: 480, summary_role: 'sleep' });
            const lookup = vi.fn((name: string) => linked.get(name)?.file ?? null);
            const getCache = vi.fn((file: TFile) => [...linked.values()].find(item => item.file === file) ?? null);
            const source = [
                '# 朝',
                '- [ ] [[Breakfast]] (30m)',
                '# 晩ごはん',
                '- [ ] 17:50 [[Dinner]] (70m)',
                '- [ ] 20:45 [[Bedroom]] (15m)',
                '# 午後',
                '- [/] 未来日の実行中記録 15:00 -',
                '# 夜',
                '- [ ] [[Sleep]] (480m)',
                '# 深夜',
                '- [ ] 起床後の片付け',
            ].join('\n');
            Object.assign(view.app, {
                metadataCache: { getFirstLinkpathDest: lookup, getFileCache: getCache },
                vault: { cachedRead: vi.fn(async () => source) },
            });

            section = await view.makeDay({ date: '2026-11-06', file: dailyFile });
            const rows = Array.from(section.querySelectorAll('.llr-reflection-row'));
            const rowWith = (text: string) => rows.find(row => row.textContent?.includes(text));
            const breakfast = rowWith('Breakfast');
            const dinner = rowWith('17:50');
            const reminder = rowWith('20:45');
            expect(breakfast).toBeDefined();
            expect(breakfast?.querySelector('.llr-reflection-axis-tick')?.getAttribute('data-minute')).toBe('360');
            expect(dinner).toBeDefined();
            expect(dinner?.querySelector('.llr-reflection-axis-tick')?.getAttribute('data-minute')).toBe('1080');
            expect(reminder).toBeDefined();
            expect(reminder?.querySelector('.llr-reflection-axis-tick')?.getAttribute('data-minute')).toBe('1260');
            expect(rowWith('起床後の片付け')).toBeUndefined();
            expect(rowWith('未来日の実行中記録')).toBeUndefined();
            expect(lookup).toHaveBeenCalledWith('Breakfast', dailyFile.path);
            expect(lookup).toHaveBeenCalledWith('Dinner', dailyFile.path);
            expect(lookup).toHaveBeenCalledWith('Bedroom', dailyFile.path);
            expect(lookup).toHaveBeenCalledWith('Sleep', dailyFile.path);
            expect(view.app.vault.cachedRead).toHaveBeenCalledWith(dailyFile);
        } finally {
            if (section && view) view.releaseDay(section);
            vi.useRealTimers();
        }
    });
});
