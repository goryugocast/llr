import { normalizeMinutesForCutoffTimeline } from './day-cutoff';

/** HHmm values on the same logical-day timeline as the summary's completed tasks.
 * Extended routine times such as 2400 already belong to the following day.
 */
export function sectionTimelineMinute(value: number, cutoffTimeHHmm?: string): number {
    const minutes = Math.floor(value / 100) * 60 + value % 100;
    return normalizeMinutesForCutoffTimeline(minutes, cutoffTimeHHmm);
}

export interface SectionBoundary {
    value: number; // Original HHmm, retained for storage and callers.
    label: string;
}

export function compareSectionBoundaries(a: SectionBoundary, b: SectionBoundary): number {
    return sectionTimelineMinute(a.value) - sectionTimelineMinute(b.value)
        || a.label.localeCompare(b.label, 'ja');
}

/** Boundaries must be sorted with compareSectionBoundaries. */
export function resolveSectionLabel(
    value: number,
    boundaries: SectionBoundary[],
    wrapBeforeFirst = false,
): string | null {
    if (!Number.isFinite(value)) return null;
    const minute = sectionTimelineMinute(value);
    let selected: string | null = null;
    for (const boundary of boundaries) {
        if (minute < sectionTimelineMinute(boundary.value)) break;
        selected = boundary.label;
    }
    return selected ?? (wrapBeforeFirst ? boundaries[boundaries.length - 1]?.label ?? null : null);
}
