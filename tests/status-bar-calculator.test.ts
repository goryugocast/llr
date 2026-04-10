import { describe, it, expect } from 'vitest';
import { computeStatusBarMetrics, estimateFromLineEnd } from '../src/service/status-bar-calculator';
import { calculateDuration } from '../src/service/time-calculator';

describe('status-bar-calculator', () => {
    describe('estimateFromLineEnd', () => {
        it('counts bare line-end minute pattern', () => {
            expect(estimateFromLineEnd('Task 30m')).toBe(30);
        });

        it('does not count when duration is not at line end', () => {
            expect(estimateFromLineEnd('Task 30m memo')).toBe(0);
        });

        it('counts decimal hours at line end', () => {
            expect(estimateFromLineEnd('メモ 1.5h')).toBe(90);
        });

        it('counts line-end duration even with timestamp in the line', () => {
            expect(estimateFromLineEnd('09:00 text 30m')).toBe(30);
        });
    });

    describe('computeStatusBarMetrics', () => {
        it('counts only checkbox task lines when calculating totals/remains/cursor', () => {
            const lines = [
                'Task 30m',
                'Task 30m memo',
                '- [/] Running 09:00 - (60m)',
                '  Indented 50m',
                '- [x] Done 10:00 - 10:30 (30m)',
            ];

            const result = computeStatusBarMetrics(lines, 2, '09:30', calculateDuration);

            // total: running 60 + done 30
            expect(result.totalMin).toBe(90);
            // remain: running (60 - 30 elapsed)
            expect(result.remainMin).toBe(30);
            // cursor at running line includes running remaining only
            expect(result.cursorMin).toBe(30);
        });
    });
});
