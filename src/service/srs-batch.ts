/**
 * SRS バッチ表示の薄いラッパー。tag='srs' 固定で batch-display を呼ぶ。
 */
export { type BatchCandidate as SrsBatchCandidate, formatTaskLine as formatSrsTaskLine, collectLinkedBasenames } from './batch-display';
import { batchStartMarker, batchEndMarker, batchDoneMarker, sortCandidatesByOverdue, isBatchAllComplete, buildBatchBlock, type BatchCandidate } from './batch-display';

const SRS_TAG = 'srs';

export const SRS_BATCH_START = batchStartMarker(SRS_TAG);
export const SRS_BATCH_END = batchEndMarker(SRS_TAG);
export const SRS_BATCH_DONE = batchDoneMarker(SRS_TAG);

export function sortSrsCandidatesByOverdue(candidates: BatchCandidate[], todayStr: string): BatchCandidate[] {
    return sortCandidatesByOverdue(candidates, todayStr);
}

export function isSrsBatchAllComplete(content: string): boolean {
    return isBatchAllComplete(content, SRS_TAG);
}

export function buildSrsBatchBlock(candidates: BatchCandidate[]): string[] {
    return buildBatchBlock(SRS_TAG, candidates);
}
