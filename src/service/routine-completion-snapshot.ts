import { App, MarkdownView, TFile } from 'obsidian';
import { hasPendingRoutineAtDoneMarker } from './routine-atdone-marker';

export interface RoutineCompletionSnapshotEntry {
    totalCount: number;
    completedCount: number;
    completedSignatures: Set<string>;
    atDoneCompletedSignatures: Set<string>;
}

export type RoutineCompletionSnapshot = Map<string, RoutineCompletionSnapshotEntry>;

/** 完了済みルーチン行を一意に識別するシグネチャ。スナップショット構築と @done 処理で共有する。 */
export function buildRoutineCompletionSignature(lineNumber: number, lineText: string): string {
    const normalized = lineText.trim();
    return normalized ? `${lineNumber}:${normalized}` : `${lineNumber}:__completed__`;
}

export interface RoutineSnapshotDeps {
    isDailyNoteFile(file: TFile): boolean;
    resolveRoutineFile(link: string, sourcePath: string): TFile | null;
}

/**
 * デイリーノートごとの「どのルーチンリンク行が完了済みか」のスナップショットを保持・構築する。
 *
 * metadataCache の listItems × links を突き合わせ、各ルーチン正本パスに対して
 * 完了数・完了シグネチャ・@done 保留シグネチャを集計する。メタデータ変更時に
 * 前回スナップショットと差分を取り、新たに完了した行を検出するための土台になる。
 *
 * 差分判定そのもの（完了検出 → エンジン呼び出し / @done 処理）は LlrPlugin 側に残し、
 * このクラスは「保管」と「構築」だけを担う。依存（isDailyNoteFile / resolveRoutineFile）は注入。
 */
export class RoutineCompletionSnapshotStore {
    private byFile = new Map<string, RoutineCompletionSnapshot>();

    constructor(
        private readonly app: App,
        private readonly deps: RoutineSnapshotDeps,
    ) {}

    get(path: string): RoutineCompletionSnapshot | undefined {
        return this.byFile.get(path);
    }

    set(path: string, snapshot: RoutineCompletionSnapshot): void {
        this.byFile.set(path, snapshot);
    }

    delete(path: string): void {
        this.byFile.delete(path);
    }

    clear(): void {
        this.byFile.clear();
    }

    createEmptyEntry(): RoutineCompletionSnapshotEntry {
        return {
            totalCount: 0,
            completedCount: 0,
            completedSignatures: new Set<string>(),
            atDoneCompletedSignatures: new Set<string>(),
        };
    }

    /** デイリーノートを初めて開いたときの基準スナップショットを用意する（既にあれば何もしない）。 */
    prime(file: TFile): void {
        if (!this.deps.isDailyNoteFile(file)) return;
        if (this.byFile.has(file.path)) return;

        const snapshot = this.build(file);
        if (!snapshot) return;
        this.byFile.set(file.path, snapshot);
    }

    build(file: TFile): RoutineCompletionSnapshot | null {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache || !cache.listItems) {
            return null;
        }

        const currentSnapshot: RoutineCompletionSnapshot = new Map();
        const listItems = [...cache.listItems]
            .filter((item) => typeof item.task === 'string')
            .sort((a, b) =>
                a.position.start.offset - b.position.start.offset ||
                a.position.end.offset - b.position.end.offset
            );
        const links = [...(cache.links ?? [])].sort((a, b) =>
            a.position.start.offset - b.position.start.offset ||
            a.position.end.offset - b.position.end.offset
        );

        if (listItems.length === 0 || links.length === 0) {
            return currentSnapshot;
        }

        const activeContent = this.getActiveEditorContentForFile(file);
        const lines = activeContent?.split('\n') ?? null;

        let linkCursor = 0;
        const resolvedRoutineCache = new Map<string, TFile | null>();

        for (const item of listItems) {
            const start = item.position.start.offset;
            const end = item.position.end.offset;

            while (linkCursor < links.length && links[linkCursor].position.end.offset < start) {
                linkCursor++;
            }

            let scanIndex = linkCursor;
            const seenRoutinePathsInItem = new Set<string>();

            for (; scanIndex < links.length; scanIndex++) {
                const link = links[scanIndex];
                const linkStart = link.position.start.offset;
                const linkEnd = link.position.end.offset;

                if (linkStart > end) break;
                if (linkStart < start || linkEnd > end) continue;

                let routineFile = resolvedRoutineCache.get(link.link);
                if (routineFile === undefined) {
                    routineFile = this.deps.resolveRoutineFile(link.link, file.path);
                    resolvedRoutineCache.set(link.link, routineFile);
                }
                if (!routineFile) continue;
                if (seenRoutinePathsInItem.has(routineFile.path)) continue;
                seenRoutinePathsInItem.add(routineFile.path);

                const isComplete = item.task === 'x';
                const lineNumber = item.position.start.line;
                const lineText = lines?.[lineNumber] ?? '';
                const signature = isComplete ? buildRoutineCompletionSignature(lineNumber, lineText) : null;
                const hasAtDone = isComplete && lineText.length > 0 && hasPendingRoutineAtDoneMarker(lineText);
                const entry = currentSnapshot.get(routineFile.path) ?? this.createEmptyEntry();
                entry.totalCount += 1;
                if (isComplete) {
                    entry.completedCount += 1;
                    if (signature) {
                        entry.completedSignatures.add(signature);
                    }
                    if (hasAtDone && signature) {
                        entry.atDoneCompletedSignatures.add(signature);
                    }
                }
                currentSnapshot.set(routineFile.path, entry);
            }
        }

        return currentSnapshot;
    }

    private getActiveEditorContentForFile(file: TFile): string | null {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file || view.file.path !== file.path) return null;
        return view.editor.getValue();
    }
}
