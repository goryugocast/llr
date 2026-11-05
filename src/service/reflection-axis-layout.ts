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
    endMinute: number;
}

/** Build a normal-flow timeline axis, sorting times with source order as the tie-breaker. */
export function buildReflectionAxisLayout(
    blocks: readonly ReflectionBlock[],
    boundaryMinute = 180,
): ReflectionAxisLayout {
    const intervals: Array<{ start: number; end: number; index: number; point: boolean }> = [];
    const untimed: number[] = [];
    let endMinute = boundaryMinute + 1440;

    blocks.forEach((block, index) => {
        const { startMinute: start, endMinute: end } = block;
        if (start === null && end === null) {
            untimed.push(index);
            return;
        }
        const pointMinute = start ?? end;
        const point = start === null || end === null || end <= start;
        const intervalStart = point ? pointMinute : start;
        const intervalEnd = point ? pointMinute : end;
        intervals.push({ start: intervalStart, end: intervalEnd, index, point });
        if (!point) endMinute = Math.max(endMinute, intervalEnd);
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
    return { segments, untimed, endMinute };
}

/** Convert elapsed minutes to a linearly proportional pixel height. */
export function reflectionTimeHeight(minutes: number, pxPerHour = 32): number {
    return minutes * pxPerHour / 60;
}

/** Format an absolute minute on the reflection axis, naming later days. */
export function formatReflectionClock(minute: number): string {
    const day = Math.floor(minute / 1440);
    const clockMinute = ((minute % 1440) + 1440) % 1440;
    const prefix = day <= 0 ? '' : day === 1 ? '翌 ' : `${day}日後 `;
    return `${prefix}${String(Math.floor(clockMinute / 60)).padStart(2, '0')}:${String(clockMinute % 60).padStart(2, '0')}`;
}
