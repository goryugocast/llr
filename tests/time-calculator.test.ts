import { describe, it, expect } from 'vitest';
import {
    calculateEndTime,
    calculateDuration,
    extractCompletionEndTime,
    findLatestCompletionEndTime,
    parseTimeToMinutes
} from '../src/service/time-calculator';

describe('TimeCalculator', () => {

    describe('calculateEndTime', () => {
        it('adds minutes to start time', () => {
            // 09:00 + 45m = 09:45
            expect(calculateEndTime('09:00', 45)).toBe('09:45');
        });

        it('handles hour rollover', () => {
            // 09:50 + 20m = 10:10
            expect(calculateEndTime('09:50', 20)).toBe('10:10');
        });

        it('handles day rollover (24h+)', () => {
            // 23:50 + 20m = 24:10 (or 00:10, depending on spec. Spec said 24h format but usually 00:10)
            // Let's assume standard 24h clock: 00:10
            expect(calculateEndTime('23:50', 20)).toBe('00:10');
        });
    });

    describe('calculateDuration', () => {
        it('calculates diff in minutes', () => {
            expect(calculateDuration('09:00', '09:45')).toBe(45);
        });

        it('handles day boundary (midnight)', () => {
            // 23:50 -> 00:10 = 20 min
            expect(calculateDuration('23:50', '00:10')).toBe(20);
        });
    });

    describe('parseTimeToMinutes', () => {
        it('parses HH:mm to minutes', () => {
            expect(parseTimeToMinutes('09:45')).toBe(585);
        });

        it('returns null for invalid format', () => {
            expect(parseTimeToMinutes('9:45')).toBeNull();
            expect(parseTimeToMinutes('abc')).toBeNull();
            expect(parseTimeToMinutes('')).toBeNull();
        });

        it('returns null for out-of-range hours', () => {
            expect(parseTimeToMinutes('25:00')).toBeNull();
        });

        it('returns null for out-of-range minutes', () => {
            expect(parseTimeToMinutes('12:60')).toBeNull();
        });

        it('parses midnight correctly', () => {
            expect(parseTimeToMinutes('00:00')).toBe(0);
        });

        it('parses end of day correctly', () => {
            expect(parseTimeToMinutes('23:59')).toBe(1439);
        });
    });

    describe('calculateEndTime edge cases', () => {
        it('adds zero minutes', () => {
            expect(calculateEndTime('10:00', 0)).toBe('10:00');
        });

        it('adds large duration spanning multiple days', () => {
            expect(calculateEndTime('10:00', 1440)).toBe('10:00');
        });
    });

    describe('calculateDuration edge cases', () => {
        it('returns 0 for same start and end', () => {
            expect(calculateDuration('10:00', '10:00')).toBe(0);
        });
    });

    describe('extractCompletionEndTime', () => {

        it('extracts the end time from a completed task', () => {
            expect(extractCompletionEndTime('- [x] 09:00 - 09:45 Review PR')).toBe('09:45');
        });

        it('extracts the single timestamp when a completed task has no range', () => {
            expect(extractCompletionEndTime('- [x] 09:45 Review PR')).toBe('09:45');
        });

        it('extracts end time from v2 format (times at tail, no planned start)', () => {
            expect(extractCompletionEndTime('- [x] Review PR 09:00 - 09:45 (30m)')).toBe('09:45');
        });

        it('extracts actual end time from v2 format with planned start', () => {
            expect(extractCompletionEndTime('- [x] 07:00 Review PR 16:40 - 17:10 (30m)')).toBe('17:10');
        });

        it('returns the latest completion time across all completed tasks', () => {
            const lines = [
                '- [x] 09:00 - 09:20 First',
                '- [ ] Next task',
                '- [x] 11:00 - 11:10 Second',
                '- [x] 10:15 - 10:50 Third',
            ];

            expect(findLatestCompletionEndTime(lines, '12:00')).toBe('11:10');
        });

        it('prefers the latest completion that is not after the reference time', () => {
            const lines = [
                '- [x] 23:30 - 23:55 Late task',
                '- [x] 00:01 - 00:10 After midnight',
            ];

            expect(findLatestCompletionEndTime(lines, '00:15')).toBe('00:10');
        });

        it('returns the most recently completed task across midnight when all times precede reference', () => {
            // reference 00:15: 23:30 is 45 min ago, 23:40 is 35 min ago → 23:40 wins
            const lines = [
                '- [x] 22:00 - 22:30 First',
                '- [x] 23:00 - 23:40 Second',
            ];

            expect(findLatestCompletionEndTime(lines, '00:15')).toBe('23:40');
        });

        it('considers running task start time as the latest activity anchor', () => {
            const lines = [
                '- [x] 13:00 [[✍️Substack会議]] 12:45 - 13:51 (66m)',
                '- [/] [[🏔️KS動画]] 16:06 -',
                '- [ ] [[🍳晩ごはんを作る]] (60m)',
            ];

            expect(findLatestCompletionEndTime(lines, '17:00')).toBe('16:06');
        });

        it('extractCompletionEndTime returns start time of running task', () => {
            expect(extractCompletionEndTime('- [/] [[Task]] 16:06 -')).toBe('16:06');
        });

        it('extractCompletionEndTime returns null for running task with no actual start', () => {
            expect(extractCompletionEndTime('- [/] [[Task]] (30m)')).toBeNull();
        });

        it('returns null for unchecked tasks', () => {
            expect(extractCompletionEndTime('- [ ] Task (30m)')).toBeNull();
        });

        it('returns null for plain lines', () => {
            expect(extractCompletionEndTime('- Some note')).toBeNull();
        });

        it('returns null for cancelled tasks', () => {
            expect(extractCompletionEndTime('- [-] Cancelled (30m)')).toBeNull();
        });
    });

    describe('findLatestCompletionEndTime edge cases', () => {
        it('returns null for empty array', () => {
            expect(findLatestCompletionEndTime([])).toBeNull();
        });

        it('returns null when no tasks have timestamps', () => {
            expect(findLatestCompletionEndTime(['- [ ] Task', '- Some note'])).toBeNull();
        });

        it('works without reference time', () => {
            const lines = [
                '- [x] Task A 09:00 - 09:30 (30m)',
                '- [x] Task B 10:00 - 10:15 (15m)',
            ];
            expect(findLatestCompletionEndTime(lines)).toBe('10:15');
        });
    });

});
