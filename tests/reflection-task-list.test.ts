import { describe, expect, it, vi } from 'vitest';
import type { Component } from 'obsidian';
import type { ReflectionTask } from '../src/service/reflection-timeline';

vi.mock('obsidian', () => ({ Component: class {} }));
import { renderReflectionTask } from '../src/view/reflection-task-list';

/** Minimal DOM adapter: these checks cover emitted structure, not visual layout. */
class ElementStub {
    children: ElementStub[] = [];
    dataset: Record<string, string> = {};
    style: Record<string, string> = {};
    text = '';
    constructor(public classes = '') {}
    createDiv(cls: string) {
        const el = new ElementStub(cls);
        this.children.push(el);
        return el;
    }
    createSpan(options: { cls: string; text: string }) {
        const el = this.createDiv(options.cls);
        el.text = options.text;
        return el;
    }
    toggleClass(name: string, on: boolean) {
        const classes = new Set(this.classes.split(' '));
        if (on) classes.add(name); else classes.delete(name);
        this.classes = [...classes].join(' ');
    }
    find(cls: string): ElementStub | undefined {
        if (this.classes.split(' ').includes(cls)) return this;
        return this.children.map(child => child.find(cls)).find(Boolean);
    }
}
const task = (overrides: Partial<ReflectionTask> = {}): ReflectionTask => ({
    id: 0, kind: 'task', line: 0, sourceLine: 1, title: '[[Example|Task]]', status: 'x',
    actualStart: '10:00', actualEnd: '10:30', startMinute: 600, endMinute: 630,
    source: '', supplement: 'This memo must not appear.', supplements: '', ...overrides,
});
async function render(record = task()) {
    const root = new ElementStub();
    const markdown = vi.fn((el: HTMLElement, text: string) => { (el as unknown as ElementStub).text = text; return Promise.resolve(); });
    await renderReflectionTask(root as unknown as HTMLElement, { date: '2026-11-05' }, record, 0, {} as Component, { renderMarkdown: markdown });
    return { root, markdown };
}

describe('reflection task mode keeps the sidebar reading contract', () => {
    it('renders only the title, time range and fixed-scale bar, with no disclosure or memo', async () => {
        const { root, markdown } = await render();
        expect(markdown.mock.calls.map(call => call[1])).toEqual(['[[Example|Task]]']);
        expect(root.find('llr-time')?.text).toBe('10:00 - 10:30');
        expect(root.find('llr-bar-fill')?.style.width).toBe('25%');
        expect(root.find('llr-item-done')).toBeDefined();
        expect(root.find('llr-reflection-task-memo')).toBeUndefined();
        expect(root.find('llr-reflection-task-details')).toBeUndefined();
    });
    it('does not expose standalone memos', async () => {
        const { root, markdown } = await render(task({kind: 'memo'}));
        expect(root.children).toHaveLength(0);
        expect(markdown).not.toHaveBeenCalled();
    });
    it('keeps the empty duration track and both times for zero-minute records', async () => {
        const { root } = await render(task({ actualEnd: '10:00', endMinute: 600 }));
        expect(root.find('llr-time')?.text).toBe('10:00 - 10:00');
        expect(root.find('llr-bar-fill')?.style.width).toBe('0%');
    });
    it('caps the duration bar at 120 minutes, independently of other tasks', async () => {
        const { root } = await render(task({ actualEnd: '13:00', endMinute: 780 }));
        expect(root.find('llr-bar-fill')?.style.width).toBe('100%');
    });
    it('does not label a plain record as completed or invent actual times', async () => {
        const { root } = await render(task({status: null, actualStart: '', actualEnd: '', startMinute: null, endMinute: null}));
        expect(root.find('llr-item-done')).toBeUndefined();
        expect(root.find('llr-time')?.text).toBe('- - -');
        expect(root.find('llr-bar-fill')?.style.width).toBe('0%');
    });
});
