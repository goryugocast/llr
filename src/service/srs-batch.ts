export const SRS_BATCH_START = '<!-- llr:srs-batch start -->';
export const SRS_BATCH_END = '<!-- llr:srs-batch end -->';

export interface SrsBatchCandidate {
    basename: string;
    next_due?: string;
    start?: number;
    estimate?: number;
}

export function formatSrsTaskLine(r: SrsBatchCandidate): string {
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

export function sortSrsCandidatesByOverdue(
    candidates: SrsBatchCandidate[],
    todayStr: string
): SrsBatchCandidate[] {
    return [...candidates].sort((a, b) => {
        const aOverdue = a.next_due && a.next_due <= todayStr ? 1 : 0;
        const bOverdue = b.next_due && b.next_due <= todayStr ? 1 : 0;
        if (aOverdue !== bOverdue) return bOverdue - aOverdue;
        return (a.next_due ?? '').localeCompare(b.next_due ?? '');
    });
}

export function isSrsBatchAllComplete(content: string): boolean {
    const startIdx = content.indexOf(SRS_BATCH_START);
    const endIdx = content.indexOf(SRS_BATCH_END);
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return false;

    const batchContent = content.slice(startIdx + SRS_BATCH_START.length, endIdx);
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

export function buildSrsBatchBlock(candidates: SrsBatchCandidate[]): string[] {
    return [
        SRS_BATCH_START,
        ...candidates.map(formatSrsTaskLine),
        SRS_BATCH_END,
    ];
}
