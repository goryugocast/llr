import type { Workspace, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_SUMMARY } from './summary-view';
import { LlrView } from './llr-view';
import { VIEW_TYPE_REFLECTION } from './reflection-view';

/** Migrate saved legacy reflection leaves into the current LLR summary view. */
export async function migrateLlrViews(workspace: Workspace): Promise<void> {
    for (const old of workspace.getLeavesOfType(VIEW_TYPE_REFLECTION)) {
        const existing = workspace.getLeavesOfType(VIEW_TYPE_SUMMARY).find(leaf =>
            leaf.getRoot() === old.getRoot() && old.getRoot() !== workspace.rootSplit);
        if (existing) {
            await existing.loadIfDeferred();
            if (existing.view instanceof LlrView) await existing.view.showMode('timeline');
            old.detach();
            await workspace.revealLeaf(existing);
        } else {
            await old.setViewState({ type: VIEW_TYPE_SUMMARY, state: { displayMode: 'timeline' } });
        }
    }

    // Reload can restore saved leaves after the legacy conversion starts.
    // A sidebar has one LLR entry; independent central panes remain valid.
    const sidebar = new Map<ReturnType<WorkspaceLeaf['getRoot']>, WorkspaceLeaf>();
    for (const leaf of workspace.getLeavesOfType(VIEW_TYPE_SUMMARY)) {
        const root = leaf.getRoot();
        if (root === workspace.rootSplit) continue;
        const first = sidebar.get(root);
        if (!first) {
            sidebar.set(root, leaf);
            continue;
        }
        const keep = leaf.view.containerEl.isShown() ? leaf : first;
        const duplicate = keep === leaf ? first : leaf;
        sidebar.set(root, keep);
        duplicate.detach();
    }
}
