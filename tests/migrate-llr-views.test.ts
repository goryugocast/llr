import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/view/summary-view', () => ({ VIEW_TYPE_SUMMARY: 'llr-summary' }));
vi.mock('../src/view/reflection-view', () => ({ VIEW_TYPE_REFLECTION: 'llr-reflection' }));
vi.mock('../src/view/llr-view', () => ({
    LlrView: class LlrView {
        modes: string[] = [];
        async showMode(mode: string) { this.modes.push(mode); }
    },
}));

import { LlrView } from '../src/view/llr-view';
import { migrateLlrViews } from '../src/view/migrate-llr-views';

type Root = object;
type StubLlrView = { modes: string[]; showMode: (mode: 'timeline') => Promise<void> };
type FakeLeaf = {
    type: string;
    root: Root;
    view: { containerEl: { isShown: () => boolean }; showMode?: (mode: 'timeline') => Promise<void> };
    loadIfDeferred: () => Promise<void>;
    setViewState: (state: { type: string; state?: Record<string, unknown> }) => Promise<void>;
    detach: () => void;
    detached: boolean;
};

function makeWorkspace() {
    const centerRoot = {};
    const roots: Root[] = [centerRoot];
    const leaves: FakeLeaf[] = [];
    const makeLlrView = (): StubLlrView => {
        const view = Object.create(LlrView.prototype) as StubLlrView;
        view.modes = [];
        return view;
    };
    const workspace = {
        rootSplit: centerRoot,
        getLeavesOfType(type: string) { return leaves.filter(leaf => !leaf.detached && leaf.type === type); },
        revealLeaf: vi.fn(async () => {}),
    };
    const makeLeaf = (type: string, root: Root, options: { shown?: boolean; deferred?: () => Promise<void> } = {}): FakeLeaf => {
        const leaf: FakeLeaf = {
            type,
            root,
            view: type === 'llr-summary'
                ? Object.assign(makeLlrView(), { containerEl: { isShown: () => options.shown ?? false } })
                : { containerEl: { isShown: () => options.shown ?? false } },
            loadIfDeferred: vi.fn(async () => { await options.deferred?.(); }),
            setViewState: vi.fn(async state => {
                leaf.type = state.type;
                if (state.type === 'llr-summary') leaf.view = Object.assign(makeLlrView(), { containerEl: { isShown: () => options.shown ?? false } });
            }),
            detach: vi.fn(() => { leaf.detached = true; }),
            detached: false,
        };
        Object.assign(leaf, { getRoot: () => root });
        leaves.push(leaf);
        return leaf;
    };
    return { workspace, leaves, centerRoot, roots, makeLeaf };
}

const SUMMARY = 'llr-summary';
const REFLECTION = 'llr-reflection';

describe('LLR workspace view migration', () => {
    it('merges a legacy reflection sidebar into the existing LLR sidebar', async () => {
        const { workspace, makeLeaf } = makeWorkspace();
        const sideRoot = {};
        const current = makeLeaf(SUMMARY, sideRoot, { shown: true });
        const legacy = makeLeaf(REFLECTION, sideRoot);

        await migrateLlrViews(workspace as never);

        expect((current.view as unknown as StubLlrView).modes).toEqual(['timeline']);
        expect(legacy.detach).toHaveBeenCalledOnce();
        expect(workspace.revealLeaf).toHaveBeenCalledWith(current);
        expect(workspace.getLeavesOfType(SUMMARY)).toEqual([current]);
    });

    it('converts a legacy central reflection in its existing pane', async () => {
        const { workspace, centerRoot, makeLeaf } = makeWorkspace();
        const legacy = makeLeaf(REFLECTION, centerRoot);

        await migrateLlrViews(workspace as never);

        expect(legacy.setViewState).toHaveBeenCalledWith({ type: SUMMARY, state: { displayMode: 'timeline' } });
        expect(legacy.detached).toBe(false);
        expect(workspace.getLeavesOfType(SUMMARY)).toEqual([legacy]);
    });

    it('preserves multiple central LLR panes', async () => {
        const { workspace, centerRoot, makeLeaf } = makeWorkspace();
        const centralOne = makeLeaf(SUMMARY, centerRoot);
        const centralTwo = makeLeaf(SUMMARY, centerRoot);

        await migrateLlrViews(workspace as never);

        expect(workspace.getLeavesOfType(SUMMARY)).toEqual([centralOne, centralTwo]);
        expect(centralOne.detached).toBe(false);
        expect(centralTwo.detached).toBe(false);
    });

    it('keeps the currently shown entry when duplicate sidebar summaries share a root', async () => {
        const { workspace, makeLeaf } = makeWorkspace();
        const sideRoot = {};
        const hidden = makeLeaf(SUMMARY, sideRoot);
        const shown = makeLeaf(SUMMARY, sideRoot, { shown: true });

        await migrateLlrViews(workspace as never);

        expect(hidden.detached).toBe(true);
        expect(shown.detached).toBe(false);
        expect(workspace.getLeavesOfType(SUMMARY)).toEqual([shown]);
    });

    it('does not merge LLR entries in separate sidebar roots', async () => {
        const { workspace, makeLeaf } = makeWorkspace();
        const left = makeLeaf(SUMMARY, {});
        const right = makeLeaf(SUMMARY, {});

        await migrateLlrViews(workspace as never);

        expect(left.detached).toBe(false);
        expect(right.detached).toBe(false);
    });

    it('waits for a deferred existing sidebar view before switching and detaching the legacy leaf', async () => {
        const { workspace, makeLeaf } = makeWorkspace();
        const sideRoot = {};
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const current = makeLeaf(SUMMARY, sideRoot, { deferred: () => gate });
        const legacy = makeLeaf(REFLECTION, sideRoot);
        const migration = migrateLlrViews(workspace as never);

        await Promise.resolve();
        expect(current.loadIfDeferred).toHaveBeenCalledOnce();
        expect(legacy.detached).toBe(false);
        expect((current.view as unknown as StubLlrView).modes).toEqual([]);

        release();
        await migration;
        expect((current.view as unknown as StubLlrView).modes).toEqual(['timeline']);
        expect(legacy.detached).toBe(true);
    });
});
