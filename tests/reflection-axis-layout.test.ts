import { describe, expect, it } from 'vitest';
import type { ReflectionBlock } from '../src/service/reflection-timeline';
import { buildReflectionAxisLayout, formatReflectionClock, reflectionTimeHeight } from '../src/service/reflection-axis-layout';

const block = (startMinute: number | null, endMinute: number | null, title = 'work'): ReflectionBlock => ({
    id: 0, title, startMinute, endMinute, tasks: [],
});

describe('reflection axis layout', () => {
    it('uses one consistent height per elapsed hour', () => {
        expect(reflectionTimeHeight(60)).toBe(32);
        expect(reflectionTimeHeight(120)).toBe(64);
        expect(reflectionTimeHeight(180)).toBe(96);
        expect(reflectionTimeHeight(600)).toBe(320);
        expect(reflectionTimeHeight(60, 48)).toBe(48);
        expect(reflectionTimeHeight(180, 48)).toBe(144);
        expect(reflectionTimeHeight(600, 48)).toBe(480);
        expect(reflectionTimeHeight(0)).toBe(0);
        expect(reflectionTimeHeight(-60)).toBe(0);
    });

    it('fills elapsed time with gaps while retaining activity positions', () => {
        const result = buildReflectionAxisLayout([
            block(300, 360), // 05:00–06:00
            block(600, 660), // 10:00–11:00
        ]);
        expect(result.segments).toEqual([
            { kind: 'gap', startMinute: 180, endMinute: 300 },
            { kind: 'activity', startMinute: 300, endMinute: 360, blockIndex: 0 },
            { kind: 'gap', startMinute: 360, endMinute: 600 },
            { kind: 'activity', startMinute: 600, endMinute: 660, blockIndex: 1 },
            { kind: 'gap', startMinute: 660, endMinute: 1620 },
        ]);
        expect(result.endMinute).toBe(1620);
        expect(result.outsideDay).toEqual([]);
        expect(result.segments.filter(segment => segment.kind !== 'point').reduce((minutes, segment) => minutes + segment.endMinute - segment.startMinute, 0)).toBe(1440);
    });

    it('keeps zero-duration and open-ended blocks as points without adding elapsed time', () => {
        const result = buildReflectionAxisLayout([
            block(300, 360),
            block(400, 400, 'zero'),
            block(500, null, 'open'),
            block(3000, 3000, 'later point'),
        ]);
        expect(result.segments.filter(segment => segment.kind === 'point')).toEqual([
            { kind: 'point', startMinute: 400, endMinute: 400, blockIndex: 1 },
            { kind: 'point', startMinute: 500, endMinute: 500, blockIndex: 2 },
            { kind: 'point', startMinute: 3000, endMinute: 3000, blockIndex: 3 },
        ]);
        expect(result.endMinute).toBe(1620);
        expect(result.segments.filter(segment => segment.kind !== 'point').reduce((minutes, segment) => minutes + segment.endMinute - segment.startMinute, 0)).toBe(1440);
    });

    it('clips overnight intervals and collects intervals wholly outside the day axis', () => {
        const blocks = [
            block(0, 100, 'before'),
            block(1560, 1740, 'overnight'),
            block(1700, 1800, 'after'),
            block(null, null, 'untimed'),
        ];
        const before = structuredClone(blocks);
        const result = buildReflectionAxisLayout(blocks);
        expect(result.endMinute).toBe(1620);
        expect(result.segments).toContainEqual({ kind: 'activity', startMinute: 1560, endMinute: 1620, blockIndex: 1 });
        expect(result.outsideDay).toEqual([0, 2]);
        expect(result.untimed).toEqual([3]);
        expect(blocks).toEqual(before);
    });

    it('keeps point records outside the day axis as points without adding elapsed time', () => {
        const result = buildReflectionAxisLayout([block(3000, 3000, 'later point')]);
        expect(result.segments).toEqual([
            { kind: 'point', startMinute: 3000, endMinute: 3000, blockIndex: 0 },
            { kind: 'gap', startMinute: 180, endMinute: 1620 },
        ]);
        expect(result.outsideDay).toEqual([]);
        expect(result.endMinute).toBe(1620);
    });

    it('formats clocks on the absolute axis', () => {
        expect(formatReflectionClock(180)).toBe('03:00');
        expect(formatReflectionClock(1440)).toBe('翌 00:00');
        expect(formatReflectionClock(3060)).toBe('2日後 03:00');
    });
});
