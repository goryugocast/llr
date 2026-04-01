import { describe, it, expect } from 'vitest';
import {
    calculateEndTime,
    calculateDuration,
    estimateFromText,
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

    describe('estimateFromText', () => {
        it('extracts estimate from parentheses with m', () => {
            expect(estimateFromText('[[Task (45m)]]')).toBe(45);
        });

        it('extracts estimate from parentheses with h', () => {
            expect(estimateFromText('[[Meeting (1h)]]')).toBe(60);
        });

        it('extracts decimal hours (1.5h)', () => {
            expect(estimateFromText('Jogging 1.5h')).toBe(90);
        });

        it('extracts min suffix without parens', () => {
            expect(estimateFromText('Lunch 60min')).toBe(60);
        });

        it('extracts m suffix with space', () => {
            expect(estimateFromText('Clean 30 m')).toBe(30);
        });

        it('handles change pattern (30m > 45m)', () => {
            expect(estimateFromText('Task (30m > 45m)')).toBe(45);
        });

        it('ignores timestamps (HH:mm)', () => {
            // Should not pick up '50' from '09:50'
            expect(estimateFromText('09:50 Hセミナー手伝い')).toBe(0);
        });

        it('picks duration even if timestamp exists', () => {
            expect(estimateFromText('09:50 Runner 30m')).toBe(30);
        });

        it('extracts from plain text without any prefix (Pad練習 60m)', () => {
            expect(estimateFromText('Pad練習 60m')).toBe(60);
        });

        it('returns 0 if no estimate found', () => {
            expect(estimateFromText('[[Task]]')).toBe(0);
        });
    });

    describe('completion time helpers', () => {
        it('parses HH:mm to minutes', () => {
            expect(parseTimeToMinutes('09:45')).toBe(585);
        });

        it('extracts the end time from a completed task', () => {
            expect(extractCompletionEndTime('- [x] 09:00 - 09:45 Review PR')).toBe('09:45');
        });

        it('extracts the single timestamp when a completed task has no range', () => {
            expect(extractCompletionEndTime('- [x] 09:45 Review PR')).toBe('09:45');
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

        it('falls back to the absolute latest completion when all times are after the reference', () => {
            const lines = [
                '- [x] 22:00 - 22:30 First',
                '- [x] 23:00 - 23:40 Second',
            ];

            expect(findLatestCompletionEndTime(lines, '00:15')).toBe('23:40');
        });
    });

});
