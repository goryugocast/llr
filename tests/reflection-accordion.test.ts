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
    dateInput: HTMLInputElement;
    visible: Day[]; sections: Map<string, HTMLElement>;
    app: { vault: { cachedRead: ReturnType<typeof vi.fn> }; workspace: { openLinkText: ReturnType<typeof vi.fn> } };
    makeBlock(parent: HTMLElement, day: Day, block: ReflectionBlock, occurrence: number, component: Component): Promise<void>;
    makeDay(day: Day): Promise<HTMLElement>;
    setAllDetails(open: boolean): Promise<void>;
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
    it('keeps the linked title in the activity heading without repeating it in the record', async () => {
        const { view, component } = await setup();
        await view.makeBlock(view.daysEl, day, block(960, '[[Reference|Reading]]'), 0, component);
        const heading = view.daysEl.querySelector<HTMLAnchorElement>('.llr-reflection-name a');
        expect(heading?.textContent).toBe('Reading');
        expect(heading?.getAttribute('data-href')).toBe('Reference');
        await view.setAllDetails(true);
        expect(view.daysEl.querySelectorAll('.llr-reflection-record-title')).toHaveLength(0);
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
