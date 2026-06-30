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
                '- [/] 09:00 - Running (60m)',
                '  Indented 50m',
                '- [x] 10:00 - 10:30 (30m)',
            ];

            const result = computeStatusBarMetrics(lines, 2, '09:30', calculateDuration);

            // total: running 60 + done 30
            expect(result.totalMin).toBe(90);
            // remain: running (60 - 30 elapsed)
            expect(result.remainMin).toBe(30);
            // cursor at running line includes running remaining only
            expect(result.cursorMin).toBe(30);
        });

        it('returns zeros when there are no tasks', () => {
            const lines = ['# Header', 'Some text', ''];
            const result = computeStatusBarMetrics(lines, 0, '12:00', calculateDuration);
            expect(result).toEqual({ totalMin: 0, remainMin: 0, cursorMin: 0 });
        });

        it('includes unstarted tasks in remain and cursor', () => {
            const lines = [
                '- [ ] Task A (30m)',
                '- [ ] Task B (45m)',
            ];
            const result = computeStatusBarMetrics(lines, 0, '12:00', calculateDuration);
            expect(result.totalMin).toBe(75);
            expect(result.remainMin).toBe(75);
            expect(result.cursorMin).toBe(30);
        });

        it('accumulates cursor up to and including the cursor line', () => {
            const lines = [
                '- [ ] Task A (20m)',
                '- [ ] Task B (30m)',
                '- [ ] Task C (10m)',
            ];
            const result = computeStatusBarMetrics(lines, 1, '12:00', calculateDuration);
            expect(result.cursorMin).toBe(50);
        });

        it('clamps running task remaining to zero when elapsed exceeds estimate', () => {
            const lines = [
                '- [/] 09:00 - Overdue (30m)',
            ];
            const result = computeStatusBarMetrics(lines, 0, '10:00', calculateDuration);
            expect(result.totalMin).toBe(30);
            expect(result.remainMin).toBe(0);
        });

        it('uses full estimate for running task when no time match is found', () => {
            const lines = [
                '- [/] Running no time (45m)',
            ];
            const result = computeStatusBarMetrics(lines, 0, '12:00', calculateDuration);
            expect(result.remainMin).toBe(45);
        });

        it('counts cancelled ([-]) task duration in total but not in remain', () => {
            const lines = [
                '- [-] Cancelled (30m)',
                '- [ ] Active (20m)',
            ];
            const result = computeStatusBarMetrics(lines, 1, '12:00', calculateDuration);
            expect(result.totalMin).toBe(50);
            expect(result.remainMin).toBe(20);
        });
    });
});
