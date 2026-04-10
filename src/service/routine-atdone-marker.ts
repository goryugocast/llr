const PENDING_ATDONE_PATTERN = /(^|\s)([@＠])done\b/i;
const PROCESSED_ATDONE_PATTERN = /(^|\s)→done\b/i;

export function hasPendingRoutineAtDoneMarker(lineText: string): boolean {
    return PENDING_ATDONE_PATTERN.test(lineText);
}

export function hasProcessedRoutineAtDoneMarker(lineText: string): boolean {
    return PROCESSED_ATDONE_PATTERN.test(lineText);
}

export function hasAnyRoutineAtDoneMarker(lineText: string): boolean {
    return hasPendingRoutineAtDoneMarker(lineText) || hasProcessedRoutineAtDoneMarker(lineText);
}

export function replacePendingRoutineAtDoneMarker(lineText: string): string | null {
    if (!hasPendingRoutineAtDoneMarker(lineText)) return null;

    const updated = lineText.replace(PENDING_ATDONE_PATTERN, (_matched, prefix: string) => `${prefix}→done`);
    return updated === lineText ? null : updated;
}
