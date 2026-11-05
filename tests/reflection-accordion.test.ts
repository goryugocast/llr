// @vitest-environment happy-dom
// DOM behavior only: happy-dom does not validate CSS geometry or native Markdown.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Component, WorkspaceLeaf } from 'obsidian';
import type { ReflectionBlock, ReflectionTask } from '../src/service/reflection-timeline';
import { ReflectionExpansionState } from '../src/service/reflection-expansion';

vi.mock('obsidian', async () => {
    class ComponentStub {
        children: ComponentStub[] = [];
        addChild(child: ComponentStub) { this.children.push(child); return child; }
        removeChild(child: ComponentStub) { this.children = this.children.filter(item => item !== child); }
        registerDomEvent(element: HTMLElement, name: string, callback: EventListener) { element.addEventListener(name, callback); }
    }
    return {
        Component: ComponentStub,
        ItemView: class extends ComponentStub {
            contentEl = document.createElement('div');
            app = { workspace: { openLinkText: vi.fn() }, vault: { cachedRead: vi.fn() } };
            onPaneMenu() {}
        },
        TFile: class {}, Notice: class {}, Platform: { isMobile: false },
        moment: (await import('moment')).default,
        setTooltip: (el: HTMLElement, title: string) => { el.title = title; },
        setIcon: (el: HTMLElement, icon: string) => { el.dataset.icon = icon; },
        MarkdownRenderer: {
            render: (_app: unknown, markdown: string, host: HTMLElement) => {
                const paragraph = document.createElement('p');
                paragraph.textContent = markdown;
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
    id: 0, kind: 'task', line: 0, sourceLine: 1, status: 'x', title,
    actualStart: '12:00', actualEnd: '14:18', startMinute: 720, endMinute: 858,
    source: '', supplement: 'Read the memo without closing it.', supplements: '',
});
const block = (start = 720, title = 'Lunch'): ReflectionBlock => ({
    id: start, title, startMinute: start, endMinute: start + 180, tasks: [record(title)],
});
interface Harness {
    contentEl: HTMLElement; scroller: HTMLElement; daysEl: HTMLElement; expandButton: HTMLButtonElement;
    pending: Promise<void>; expansion: ReflectionExpansionState; userScrollRevision: number;
    displayMode: 'tasks' | 'timeline'; dateInput: HTMLInputElement;
    visible: Day[]; sections: Map<string, HTMLElement>;
    app: { vault: { cachedRead: ReturnType<typeof vi.fn> } };
    makeBlock(parent: HTMLElement, day: Day, block: ReflectionBlock, occurrence: number, component: Component): Promise<void>;
    makeDay(day: Day): Promise<HTMLElement>;
    setAllDetails(open: boolean): Promise<void>; setDisplayMode(mode: 'tasks' | 'timeline'): Promise<void>;
    captureAnchor(): null; restoreAnchor(anchor: unknown): void;
    updateEdges(): void; jump(date: string): Promise<void>; today(): string;
    renderMarkdown(host: HTMLElement, markdown: string, day: Day, component: Component): Promise<void>;
}
async function setup() {
    const view = new ReflectionView({} as WorkspaceLeaf, () => ({ enabled: true, folder: '', format: 'YYYY-MM-DD' })) as unknown as Harness;
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
    it('opens inline, avoids a duplicate plain title, and closes only from its heading', async () => {
        const { view, summary, details } = await setup();
        expect(details.open).toBe(false);
        expect(view.daysEl.querySelector('.llr-reflection-record')).toBeNull();
        summary.click(); await view.pending;
        expect(details.open).toBe(true);
        expect(summary.getAttribute('aria-expanded')).toBe('true');
        expect(view.daysEl.querySelector('.llr-reflection-record-title')).toBeNull();
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
    it('keeps linked titles in the record rather than dropping navigation', async () => {
        const { view, component } = await setup();
        await view.makeBlock(view.daysEl, day, block(960, '[[Reference|Reading]]'), 0, component);
        await view.setAllDetails(true);
        expect(view.daysEl.querySelector('.llr-reflection-record-title')?.textContent).toBe('[[Reference|Reading]]');
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
    it('preserves timeline expansion across task/timeline round trips without task memo controls', async () => {
        const { view } = await setup();
        view.visible = [day];
        view.sections = new Map();
        view.updateEdges = () => {};
        view.jump = () => Promise.resolve();
        view.app.vault.cachedRead.mockResolvedValue('- [x] Lunch 12:00 - 14:18 (138m)\nMemo text');
        const sourceDay = { ...day, file: { path: '2026-11-05.md' } } as unknown as Day;
        view.visible = [sourceDay];
        await view.setAllDetails(true);
        await view.setDisplayMode('tasks');
        expect(view.daysEl.querySelector('details')).toBeNull();
        expect(view.daysEl.textContent).not.toContain('Memo text');
        expect(view.expandButton.hidden).toBe(true);
        await view.setDisplayMode('timeline');
        expect(view.daysEl.querySelector('details')?.open).toBe(true);
        expect(view.daysEl.textContent).toContain('Memo text');
        expect(view.expandButton.hidden).toBe(false);
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
