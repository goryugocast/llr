// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    ItemView: class {},
    TFile: class {},
    Notice: class {},
    MarkdownView: class {},
    setIcon: vi.fn(),
    moment: (date?: string) => ({
        format: () => date ?? '2026-11-05',
        isValid: () => !date || /^\d{4}-\d{2}-\d{2}$/.test(date),
    }),
}));

import { SummaryView } from '../src/view/summary-view';
import type { SummaryPresentation } from '../src/service/summary-calculator';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

function presentation(label: string): SummaryPresentation {
    return {
        header: { total: label, end: '--:--' },
        pastGroups: [],
        futureGroups: [],
        hiddenItems: [],
    };
}

type TestView = {
    contentEl: HTMLDivElement;
    currentDate: { format: () => string };
    isClosed: boolean;
    loadSummaryData: () => Promise<SummaryPresentation>;
    requestRefresh: () => Promise<void>;
    getDisplayDate: () => string;
    setDisplayDate: (date: string) => Promise<void>;
    onOpen: () => Promise<void>;
    onClose: () => Promise<void>;
    scheduleRefresh: () => void;
    updateTargetFile: ReturnType<typeof vi.fn>;
    app: { workspace: { onLayoutReady: ReturnType<typeof vi.fn> }; metadataCache: { on: ReturnType<typeof vi.fn> } };
    layoutReady?: () => void;
};

function makeView(read: () => Promise<SummaryPresentation>): TestView {
    const contentEl = document.createElement('div');
    document.body.append(contentEl);
    const view = Object.assign(Object.create(SummaryView.prototype), {
        contentEl,
        app: {
            workspace: {
                onLayoutReady: vi.fn((callback: () => void) => { (view as { layoutReady?: () => void }).layoutReady = callback; }),
                on: vi.fn(() => ({})),
            },
            metadataCache: { on: vi.fn(() => ({})) },
        },
        registerEvent: vi.fn(),
        layoutReady: undefined,
        currentDate: { format: () => '2026-11-05' },
        isClosed: false,
        isRefreshing: false,
        refreshQueued: false,
        refreshPromise: null,
        debouncedRefresh: null,
        routineSummaryRoleCache: new Map(),
        autoScrollToRunningUntilMs: 0,
        manualScrollSuppressedUntilMs: 0,
        ignoreScrollEventsUntilMs: 0,
        lastRunningItemKey: null,
        updateTargetFile: vi.fn(),
        requestAutoScrollToRunning: vi.fn(),
        loadSummaryData: read,
        getRunningItemKey: (): string | null => null,
        shouldAutoScrollToRunning: () => false,
        renderHeader: (container: HTMLElement, data: SummaryPresentation) => {
            const header = document.createElement('div');
            header.className = 'llr-nav-header';
            const switchButton = document.createElement('button');
            switchButton.className = 'llr-display-switch';
            header.append(switchButton);
            container.append(header);
            (container as HTMLElement & { renderedLabel?: string }).renderedLabel = data.header.total;
        },
        renderList: (container: HTMLElement, data: SummaryPresentation) => {
            const list = document.createElement('div');
            list.className = 'llr-list-container';
            list.dataset.label = data.header.total;
            list.scrollTo = () => {};
            container.append(list);
        },
    });

    return view as unknown as TestView;
}

const flushMicrotasks = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

describe('SummaryView refresh lifecycle', () => {
    const rafCallbacks: FrameRequestCallback[] = [];

    beforeEach(() => {
        Object.defineProperty(DocumentFragment.prototype, 'createDiv', {
            configurable: true,
            value(this: DocumentFragment, options?: { cls?: string }) {
                const element = document.createElement('div');
                if (options?.cls) element.className = options.cls;
                this.append(element);
                return element;
            },
        });
    });

    afterEach(() => {
        rafCallbacks.length = 0;
        vi.useRealTimers();
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    });

    it('waits for the latest date read when the date changes during an active refresh', async () => {
        const firstRead = deferred<SummaryPresentation>();
        const secondRead = deferred<SummaryPresentation>();
        const read = vi.fn()
            .mockReturnValueOnce(firstRead.promise)
            .mockReturnValueOnce(secondRead.promise);
        const view = makeView(read);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            rafCallbacks.push(callback);
            return rafCallbacks.length;
        });

        const firstCaller = view.requestRefresh();
        await flushMicrotasks();
        view.currentDate = { format: () => '2026-11-06' };
        const secondCaller = view.requestRefresh();

        firstRead.resolve(presentation('old day'));
        await flushMicrotasks();
        expect(read).toHaveBeenCalledTimes(2);
        let bothCallersFinished = false;
        void Promise.all([firstCaller, secondCaller]).then(() => { bothCallersFinished = true; });
        await flushMicrotasks();
        expect(bothCallersFinished).toBe(false);
        expect(view.contentEl.querySelector('.llr-list-container')).toBeNull();

        secondRead.resolve(presentation('new day'));
        await Promise.all([firstCaller, secondCaller]);
        expect(view.contentEl.querySelector('.llr-list-container')?.getAttribute('data-label')).toBe('new day');
        expect(rafCallbacks).toHaveLength(1);
    });

    it('does not render a late read after close', async () => {
        const pendingRead = deferred<SummaryPresentation>();
        const view = makeView(() => pendingRead.promise);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            rafCallbacks.push(callback);
            return rafCallbacks.length;
        });

        const refresh = view.requestRefresh();
        await flushMicrotasks();
        await view.onClose();
        pendingRead.resolve(presentation('late result'));
        await refresh;

        expect(view.contentEl.querySelector('.llr-list-container')).toBeNull();
        expect(rafCallbacks).toHaveLength(0);
    });

    it('cancels delayed refresh work and ignores layout-ready callbacks after close', async () => {
        vi.useFakeTimers();
        const view = makeView(async () => presentation('unused'));
        const requestRefresh = vi.spyOn(view, 'requestRefresh').mockResolvedValue(undefined);
        // ItemView's Obsidian helpers are small DOM conveniences; provide them for onOpen.
        Object.assign(view.contentEl, {
            empty: () => view.contentEl.replaceChildren(),
            addClass: (name: string) => view.contentEl.classList.add(name),
        });
        await view.onOpen();
        view.scheduleRefresh();
        await view.onClose();

        view.layoutReady?.();
        await vi.advanceTimersByTimeAsync(1500);

        expect(view.updateTargetFile).not.toHaveBeenCalled();
        expect(requestRefresh).not.toHaveBeenCalled();
    });

    it('restores the previous date after a failed read so the date can be retried', async () => {
        const view = makeView(vi.fn()
            .mockRejectedValueOnce(new Error('read failed'))
            .mockResolvedValueOnce(presentation('retry succeeded')));

        await expect(view.setDisplayDate('2026-11-06')).rejects.toThrow('read failed');
        expect(view.getDisplayDate()).toBe('2026-11-05');

        await view.setDisplayDate('2026-11-06');
        expect(view.getDisplayDate()).toBe('2026-11-06');
        expect(view.contentEl.querySelector('.llr-list-container')?.getAttribute('data-label')).toBe('retry succeeded');
    });

    it('ignores scroll restoration from a previous render', async () => {
        const view = makeView(vi.fn()
            .mockResolvedValueOnce(presentation('first'))
            .mockResolvedValueOnce(presentation('second')));
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            rafCallbacks.push(callback);
            return rafCallbacks.length;
        });

        await view.requestRefresh();
        const oldList = view.contentEl.querySelector<HTMLElement>('.llr-list-container')!;
        oldList.scrollTop = 32;
        await view.requestRefresh();
        const currentList = view.contentEl.querySelector<HTMLElement>('.llr-list-container')!;
        currentList.scrollTop = 81;

        rafCallbacks[0](0);
        expect(currentList.scrollTop).toBe(81);
    });

    it('preserves a scroll change made while the summary read is waiting', async () => {
        const pendingRead = deferred<SummaryPresentation>();
        const view = makeView(vi.fn()
            .mockResolvedValueOnce(presentation('first'))
            .mockReturnValueOnce(pendingRead.promise));
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            rafCallbacks.push(callback);
            return rafCallbacks.length;
        });

        await view.requestRefresh();
        const currentList = view.contentEl.querySelector<HTMLElement>('.llr-list-container')!;
        currentList.scrollTop = 14;
        const refresh = view.requestRefresh();
        await flushMicrotasks();
        currentList.scrollTop = 76;
        pendingRead.resolve(presentation('updated'));
        await refresh;

        const nextList = view.contentEl.querySelector<HTMLElement>('.llr-list-container')!;
        rafCallbacks[rafCallbacks.length - 1](0);
        expect(nextList.scrollTop).toBe(76);
    });

    it('keeps focus on the replacement display switch after a refresh', async () => {
        const view = makeView(vi.fn()
            .mockResolvedValueOnce(presentation('first'))
            .mockResolvedValueOnce(presentation('second')));
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            rafCallbacks.push(callback);
            return rafCallbacks.length;
        });

        await view.requestRefresh();
        const oldSwitch = view.contentEl.querySelector<HTMLButtonElement>('.llr-display-switch')!;
        oldSwitch.focus();
        await view.requestRefresh();

        const newSwitch = view.contentEl.querySelector<HTMLButtonElement>('.llr-display-switch')!;
        expect(newSwitch).not.toBe(oldSwitch);
        expect(document.activeElement).toBe(newSwitch);
    });
});
