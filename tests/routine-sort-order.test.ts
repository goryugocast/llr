import { describe, it, expect } from 'vitest';
import { routineSortKey } from '../src/service/routine-sort';

describe('routineSortKey', () => {
    const sort = (items: { section?: number; start?: number }[]) =>
        [...items].sort((a, b) => {
            const [as1, as2] = routineSortKey(a);
            const [bs1, bs2] = routineSortKey(b);
            return as1 !== bs1 ? as1 - bs1 : as2 - bs2;
        });

    it('section 付きルーチンが section 未設定より先に並ぶ', () => {
        const items = [
            { section: undefined, start: 800 },
            { section: 5, start: 900 },
        ];
        const sorted = sort(items);
        expect(sorted[0].section).toBe(5);
        expect(sorted[1].section).toBeUndefined();
    });

    it('section 付きルーチン同士は section 昇順', () => {
        const items = [
            { section: 18, start: 800 },
            { section: 5, start: 900 },
        ];
        const sorted = sort(items);
        expect(sorted[0].section).toBe(5);
        expect(sorted[1].section).toBe(18);
    });

    it('section 未設定同士は start 昇順', () => {
        const items = [
            { section: undefined, start: 1400 },
            { section: undefined, start: 800 },
        ];
        const sorted = sort(items);
        expect(sorted[0].start).toBe(800);
        expect(sorted[1].start).toBe(1400);
    });

    it('同じ section 内は start 昇順', () => {
        const items = [
            { section: 10, start: 1400 },
            { section: 10, start: 800 },
        ];
        const sorted = sort(items);
        expect(sorted[0].start).toBe(800);
        expect(sorted[1].start).toBe(1400);
    });

    it('混在: section 付き → section 未設定 の順で並ぶ', () => {
        const items = [
            { section: undefined, start: 600 },
            { section: 18, start: 1800 },
            { section: undefined, start: 1400 },
            { section: 5, start: 900 },
        ];
        const sorted = sort(items);
        expect(sorted.map(i => i.section)).toEqual([5, 18, undefined, undefined]);
        expect(sorted[2].start).toBe(600);
        expect(sorted[3].start).toBe(1400);
    });

    it('start 未設定は start 設定済みより先', () => {
        const items = [
            { section: 10, start: 800 },
            { section: 10, start: undefined },
        ];
        const sorted = sort(items);
        expect(sorted[0].start).toBeUndefined();
        expect(sorted[1].start).toBe(800);
    });
});
