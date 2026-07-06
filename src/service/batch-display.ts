/**
 * バッチ表示: デイリーノートに一度に見せるタスク数を制限し、
 * 全完了したら次のバッチを補充する仕組み。
 *
 * SRS ノートで最初に導入したが、ソースの種類（SRS・ルーチン・任意のリスト）を
 * 問わない汎用構造。マーカーの tag 引数でバッチ区間を識別する。
 */

export function batchStartMarker(tag: string): string {
    return `<!-- llr:${tag} start -->`;
}

export function batchEndMarker(tag: string): string {
    return `<!-- llr:${tag} end -->`;
}

export function batchDoneMarker(tag: string): string {
    return `<!-- llr:${tag} done -->`;
}

export interface BatchCandidate {
    basename: string;
    next_due?: string;
    start?: number;
    estimate?: number;
}

export function formatTaskLine(r: BatchCandidate): string {
    const startText = formatStartTime(r.start);
    const prefix = startText ? `${startText} ` : '';
    const suffix = r.estimate ? ` (${r.estimate}m)` : '';
    return `- [ ] ${prefix}[[${r.basename}]]${suffix}`;
}

function formatStartTime(value: number | undefined): string | null {
    if (typeof value !== 'number') return null;
    const hh = Math.floor(value / 100);
    const mm = value % 100;
    if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || mm < 0 || mm > 59) return null;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function sortCandidatesByOverdue(
    candidates: BatchCandidate[],
    todayStr: string
): BatchCandidate[] {
    const priority = (c: BatchCandidate): number => {
        if (!c.next_due) return 0;
        if (c.next_due <= todayStr) return 1;
        return 2;
    };
    return [...candidates].sort((a, b) => {
        const ap = priority(a);
        const bp = priority(b);
        if (ap !== bp) return ap - bp;
        return (a.next_due ?? '').localeCompare(b.next_due ?? '');
    });
}

export function isBatchAllComplete(content: string, tag: string): boolean {
    const start = batchStartMarker(tag);
    const end = batchEndMarker(tag);
    const startIdx = content.indexOf(start);
    const endIdx = content.indexOf(end);
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return false;

    const batchContent = content.slice(startIdx + start.length, endIdx);
    const taskLines = batchContent.split('\n').filter(l => /^- \[[ x/]\]/.test(l.trim()));
    if (taskLines.length === 0) return false;

    return taskLines.every(l => /^- \[x\]/.test(l.trim()));
}

export function collectLinkedBasenames(content: string): Set<string> {
    const result = new Set<string>();
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(content)) !== null) {
        result.add(match[1]);
    }
    return result;
}

export function buildBatchBlock(tag: string, candidates: BatchCandidate[]): string[] {
    return [
        batchStartMarker(tag),
        ...candidates.map(formatTaskLine),
        batchEndMarker(tag),
    ];
}
