// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ setIcon: vi.fn(), notices: [] as string[] }));
vi.mock('obsidian', () => ({
    ItemView: class {},
    TFile: class TFile { constructor(public path: string) {} },
    Notice: class Notice { constructor(message: string) { mocks.notices.push(message); } },
    MarkdownView: class {},
    setIcon: mocks.setIcon,
    moment: (value?: string) => {
        let date = value ?? '2026-11-06';
        return {
            format: (format: string) => format === 'YYYY-MM-DD' ? date : format === 'MM-DD' ? date.slice(5).replace('-', '-') : '金',
            day: () => 5,
            isValid: () => /^\d{4}-\d{2}-\d{2}$/.test(date),
            isSame: (other: { format: (format: string) => string }) => date === other.format('YYYY-MM-DD'),
            clone: () => ({ format: (format: string) => format === 'YYYY-MM-DD' ? date : date }),
            subtract: () => { date = '2026-11-05'; return this; },
            add: () => { date = '2026-11-07'; return this; },
        };
    },
}));

import { SummaryView } from '../src/view/summary-view';
import type { SummaryItem } from '../src/service/summary-calculator';
import { TFile } from 'obsidian';

function installObsidianDomHelpers() {
    type DomOptions = { cls?: string; text?: string; attr?: Record<string, string>; type?: string };
    type DomElement = HTMLElement & { createEl(tag: string, options?: DomOptions): HTMLElement };
    Object.assign(HTMLElement.prototype, {
        createEl(this: HTMLElement, tag: string, options: { cls?: string; text?: string; attr?: Record<string, string>; type?: string } = {}) {
            const element = document.createElement(tag);
            if (options.cls) element.className = options.cls;
            if (options.text) element.textContent = options.text;
            if (options.type) (element as HTMLInputElement).type = options.type;
            for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, value);
            this.append(element);
            return element;
        },
        createDiv(this: HTMLElement, cls?: string) {
            return (this as DomElement).createEl('div', { cls });
        },
        createSpan(this: HTMLElement, options: { cls?: string; text?: string } = {}) {
            return (this as DomElement).createEl('span', options);
        },
        setText(this: HTMLElement, text: string) { this.textContent = text; },
        addClass(this: HTMLElement, cls: string) { this.classList.add(cls); },
    });
}

function file(path: string): TFile {
    return Object.assign(new TFile(), { path });
}

function makeView(): SummaryView {
    return Object.assign(Object.create(SummaryView.prototype), {
        currentDate: { format: (pattern: string) => pattern === 'YYYY-MM-DD' ? '2026-11-06' : '11-06', day: () => 5 },
        delegate: { showTimeline: vi.fn(), getDailyNoteSettings: () => ({ enabled: true, folder: 'daily', format: 'YYYY-MM-DD' }) },
        updateTargetFile: vi.fn(),
        requestAutoScrollToRunning: vi.fn(),
        requestRefresh: vi.fn(async () => {}),
        isReservedStartItem: SummaryView.prototype['isReservedStartItem'],
        getReservedStartDelayMinutes: SummaryView.prototype['getReservedStartDelayMinutes'],
        parseClockMinutes: SummaryView.prototype['parseClockMinutes'],
        applyReservedStartTint: SummaryView.prototype['applyReservedStartTint'],
        renderTaskName: SummaryView.prototype['renderTaskName'],
        app: { workspace: { openLinkText: vi.fn(), getLeaf: vi.fn(() => ({ openFile: vi.fn() })) } },
    }) as SummaryView;
}

function item(displayText: string, overrides: Partial<SummaryItem> = {}): SummaryItem {
    return {
        text: displayText, displayText, times: [], estimate: '', line: 1, status: '[/]',
        isDone: false, isRunning: true, duration: 30, displayStartTime: '09:00', displayEndTime: '09:30',
        ...overrides,
    };
}

describe('SummaryView unified design', () => {
    beforeEach(() => {
        installObsidianDomHelpers();
        mocks.notices.length = 0;
    });

    afterEach(() => document.body.replaceChildren());

    it('uses the date button to open a picker and keeps note opening as a separate action', () => {
        const view = makeView();
        const header = document.createElement('div');
        view['renderHeader'](header, { header: { date: '11-06 (金)', total: '1:00', end: '10:00' }, pastGroups: [], futureGroups: [], hiddenItems: [] });
        const picker = header.querySelector<HTMLInputElement>('.llr-reflection-date-input')!;
        const showPicker = vi.fn();
        picker.showPicker = showPicker;
        const openDateNote = vi.spyOn(view, 'openDateNote');
        header.querySelector<HTMLButtonElement>('.llr-date-label')!.click();
        expect(showPicker).toHaveBeenCalledOnce();
        expect(openDateNote).not.toHaveBeenCalled();
        expect(header.querySelector<HTMLButtonElement>('.llr-open-daily-note')).not.toBeNull();
        expect(header.querySelector('.llr-bulk-slot')).toBeNull();
    });

    it('shows only the finish estimate even when a wake estimate is available', () => {
        const header = document.createElement('div');
        makeView()['renderHeader'](header, { header: { date: '11-06 (金)', total: '10h6m', end: '03:36', wake: '11:36' }, pastGroups: [], futureGroups: [], hiddenItems: [] });
        expect(Array.from(header.querySelectorAll('.llr-info-value')).map(value => value.textContent)).toEqual(['10h6m', '03:36']);
    });

    it('renders each task title before its time row and keeps mixed links intact', () => {
        const view = makeView();
        const host = document.createElement('div');
        const name = '🧩 [[First|first alias]] then [[Second]] with a long activity title';
        view['renderItem'](host, item(name), 120);
        const task = host.querySelector('.llr-item-self')!;
        const children = Array.from(task.children);
        expect(children.map(child => child.className)).toEqual(['llr-row-bottom', 'llr-row-top']);
        expect(task.querySelector('.llr-task-name')?.textContent).toBe('🧩 first alias then Second with a long activity title');
        expect(task.querySelectorAll('.llr-task-name a')).toHaveLength(2);
    });

    it('defers summary rerendering while the date picker has focus', async () => {
        const view = makeView() as any;
        const container = document.createElement('div');
        const dateInput = document.createElement('input');
        dateInput.className = 'llr-reflection-date-input';
        container.append(dateInput);
        document.body.append(container);
        view.contentEl = container;
        dateInput.focus();
        await view.refresh();
        expect(view.refreshDeferredForDatePicker).toBe(true);
        expect(container.querySelector('.llr-reflection-date-input')).toBe(dateInput);
    });

    it('opens an existing date-specific note without changing the summary date', async () => {
        const noteFile = file('daily/2026-11-05.md');
        const openFile = vi.fn(async () => {});
        const view = makeView() as any;
        const targetFile = file('daily/summary-target.md');
        view['targetFile'] = targetFile;
        view.app = {
            internalPlugins: { getPluginById: () => ({ enabled: true, instance: { getDailyNote: vi.fn() } }) },
            vault: { getAbstractFileByPath: (path: string) => path === noteFile.path ? noteFile : null },
            workspace: { getLeaf: () => ({ openFile }) },
        } as never;
        await view.openDateNote('2026-11-05');
        expect(openFile).toHaveBeenCalledWith(noteFile);
        expect(view.app.internalPlugins.getPluginById('daily-notes').instance.getDailyNote).not.toHaveBeenCalled();
        expect(view.getDisplayDate()).toBe('2026-11-06');
        expect(view['targetFile']).toBe(targetFile);
    });

    it('uses the core daily notes API for today and preserves its existing creation side effect', async () => {
        const noteFile = file('daily/2026-11-06.md');
        const getDailyNote = vi.fn(async (..._args: unknown[]) => noteFile);
        const openFile = vi.fn(async () => {});
        const view = makeView() as any;
        const targetFile = file('daily/summary-target.md');
        view['targetFile'] = targetFile;
        view.app = {
            internalPlugins: { getPluginById: () => ({ enabled: true, instance: { getDailyNote } }) },
            vault: { getAbstractFileByPath: vi.fn() },
            workspace: { getLeaf: () => ({ openFile }) },
        } as never;
        await view.openDateNote('2026-11-06');
        expect(getDailyNote).toHaveBeenCalledOnce();
        expect((getDailyNote.mock.calls[0]?.[0] as { format: (format: string) => string }).format('YYYY-MM-DD')).toBe('2026-11-06');
        expect(openFile).toHaveBeenCalledWith(noteFile);
        expect(view['targetFile']).toBe(noteFile);
    });

    it('keeps a hidden summary target unchanged when the timeline opens today', async () => {
        const noteFile = file('daily/2026-11-06.md');
        const getDailyNote = vi.fn(async (..._args: unknown[]) => noteFile);
        const openFile = vi.fn(async () => {});
        const view = makeView() as any;
        const targetFile = file('daily/2026-11-05.md');
        view['targetFile'] = targetFile;
        view.currentDate = { format: () => '2026-11-05' };
        view.app = {
            internalPlugins: { getPluginById: () => ({ enabled: true, instance: { getDailyNote } }) },
            vault: { getAbstractFileByPath: vi.fn() },
            workspace: { getLeaf: () => ({ openFile }) },
        } as never;
        await view.openDateNote('2026-11-06');
        expect(getDailyNote).toHaveBeenCalledOnce();
        expect(openFile).toHaveBeenCalledWith(noteFile);
        expect(view.getDisplayDate()).toBe('2026-11-05');
        expect(view['targetFile']).toBe(targetFile);
    });
});
