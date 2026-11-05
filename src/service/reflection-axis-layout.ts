import type { ReflectionBlock } from './reflection-timeline';

export interface ReflectionAxisSegment {
    kind: 'gap' | 'activity' | 'point';
    startMinute: number;
    endMinute: number;
    blockIndex?: number;
}

export interface ReflectionAxisLayout {
    segments: ReflectionAxisSegment[];
    untimed: number[];
    /** Timed blocks completely outside the day boundary, retained for a separate continuation list. */
    outsideDay: number[];
    endMinute: number;
}

/** Build a single-day overview axis, clipping cross-day intervals and sorting by time. */
export function buildReflectionAxisLayout(
    blocks: readonly ReflectionBlock[],
    boundaryMinute = 180,
): ReflectionAxisLayout {
    const intervals: Array<{ start: number; end: number; index: number; point: boolean }> = [];
    const untimed: number[] = [];
    const outsideDay: number[] = [];
    const endMinute = boundaryMinute + 1440;

    blocks.forEach((block, index) => {
        const { startMinute: start, endMinute: end } = block;
        if (start === null && end === null) {
            untimed.push(index);
            return;
        }
        if (start === null || end === null || end <= start) {
            const pointMinute = start ?? end;
            intervals.push({ start: pointMinute, end: pointMinute, index, point: true });
            return;
        }
        if (end <= boundaryMinute || start >= endMinute) {
            outsideDay.push(index);
            return;
        }
        const intervalStart = Math.max(start, boundaryMinute);
        const intervalEnd = Math.min(end, endMinute);
        intervals.push({ start: intervalStart, end: intervalEnd, index, point: false });
    });

    intervals.sort((a, b) => a.start - b.start || a.index - b.index);
    const segments: ReflectionAxisSegment[] = [];
    let cursor = boundaryMinute;
    for (const interval of intervals) {
        if (interval.point) {
            segments.push({ kind: 'point', startMinute: interval.start, endMinute: interval.end, blockIndex: interval.index });
            continue;
        }
        if (interval.start > cursor) {
            segments.push({ kind: 'gap', startMinute: cursor, endMinute: interval.start });
            cursor = interval.start;
        }
        segments.push({
            kind: 'activity',
            startMinute: interval.start,
            endMinute: interval.end,
            blockIndex: interval.index,
        });
        cursor = Math.max(cursor, interval.end);
    }
    if (endMinute > cursor) segments.push({ kind: 'gap', startMinute: cursor, endMinute });
    return { segments, untimed, outsideDay, endMinute };
}

/** Convert elapsed time to pixels, compressing minutes beyond two hours and capping long spans. */
export function reflectionTimeHeight(minutes: number, pxPerHour = 32): number {
    const baseMinutes = Math.min(Math.max(minutes, 0), 120);
    const compressedMinutes = Math.max(minutes - 120, 0);
    return Math.min(baseMinutes * pxPerHour / 60 + compressedMinutes * pxPerHour / 480, pxPerHour * 2.5);
}

/** Format an absolute minute on the reflection axis, naming later days. */
export function formatReflectionClock(minute: number): string {
    const day = Math.floor(minute / 1440);
    const clockMinute = ((minute % 1440) + 1440) % 1440;
    const prefix = day <= 0 ? '' : day === 1 ? '翌 ' : `${day}日後 `;
    return `${prefix}${String(Math.floor(clockMinute / 60)).padStart(2, '0')}:${String(clockMinute % 60).padStart(2, '0')}`;
}
