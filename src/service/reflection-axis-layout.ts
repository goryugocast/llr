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

/** Normalize zero-duration records into display-only hourly overview blocks. */
export function reflectionDisplayBlocks(blocks: readonly ReflectionBlock[]): ReflectionBlock[] {
    const result = blocks.map(block => ({ ...block, tasks: [...block.tasks] }));
    const points = new Map<number, { blockIndex: number; tasks: ReflectionBlock['tasks'] }>();
    const excludedPoints = new Set<number>();

    blocks.forEach((block, index) => {
        if (block.startMinute === null && block.endMinute === null) return;
        if (block.startMinute !== null && block.endMinute !== null && block.endMinute > block.startMinute) return;
        const minute = block.startMinute ?? block.endMinute;
        if (minute === null) return;
        const coveringIndex = blocks.findIndex(candidate => candidate.startMinute !== null && candidate.endMinute !== null && candidate.endMinute > candidate.startMinute && minute >= candidate.startMinute && minute < candidate.endMinute);
        if (coveringIndex >= 0) {
            result[coveringIndex].tasks.push(...block.tasks);
            excludedPoints.add(index);
            return;
        }
        const hour = Math.floor(minute / 60) * 60;
        const group = points.get(hour);
        if (group) group.tasks.push(...block.tasks);
        else points.set(hour, { blockIndex: index, tasks: [...block.tasks] });
        excludedPoints.add(index);
    });

    const display = result.filter((_, index) => !excludedPoints.has(index));
    for (const [hour, group] of points) {
        const original = blocks[group.blockIndex];
        display.push({ ...original, startMinute: hour, endMinute: hour + 60, tasks: group.tasks });
    }
    return display.sort((a, b) => (a.startMinute ?? Infinity) - (b.startMinute ?? Infinity) || a.id - b.id);
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

/** Convert elapsed time to pixels at one consistent height per hour. */
export function reflectionTimeHeight(minutes: number, pxPerHour = 32): number {
    return Math.max(minutes, 0) * pxPerHour / 60;
}

/** Format the visible clock without adding date qualifiers. */
export function formatReflectionClock(minute: number): string {
    const clockMinute = ((minute % 1440) + 1440) % 1440;
    return `${String(Math.floor(clockMinute / 60)).padStart(2, '0')}:${String(clockMinute % 60).padStart(2, '0')}`;
}
