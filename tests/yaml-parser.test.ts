import { describe, it, expect } from 'vitest';
import { calculateNextDue, fromDateString, toDateString, type Frequency } from '../src/service/yaml-parser';

// Helper: create a date from a string for clean test setup
const d = (str: string) => fromDateString(str);

describe('calculateNextDue', () => {

    // ---- daily ----
    describe('daily', () => {
        it('advances by 1 day', () => {
            const freq: Frequency = { type: 'daily', interval: 1 };
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-02-21');
        });

        it('advances by 3 days', () => {
            const freq: Frequency = { type: 'daily', interval: 3 };
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-02-23');
        });

        it('crosses month boundary', () => {
            const freq: Frequency = { type: 'daily', interval: 1 };
            expect(calculateNextDue(freq, d('2026-02-28'))).toBe('2026-03-01');
        });
    });

    // ---- weekly ----
    describe('weekly', () => {
        it('finds next Monday from a Saturday', () => {
            // 2026-02-21 is a Saturday
            const freq: Frequency = { type: 'weekly', days: ['Mon'] };
            expect(calculateNextDue(freq, d('2026-02-21'))).toBe('2026-02-23');
        });

        it('finds next occurrence of multiple days', () => {
            // 2026-02-20 is a Friday → next Mon or Wed
            const freq: Frequency = { type: 'weekly', days: ['Mon', 'Wed'] };
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-02-23'); // Monday
        });

        it('wraps to next week correctly', () => {
            // 2026-02-20 is a Friday, next Friday is 2026-02-27
            const freq: Frequency = { type: 'weekly', days: ['Fri'] };
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-02-27');
        });
    });

    // ---- monthly ----
    describe('monthly', () => {
        it('finds next occurrence of day 25 from Feb 20', () => {
            const freq: Frequency = { type: 'monthly', dates: [25] };
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-02-25');
        });

        it('advances to next month when the day has passed', () => {
            const freq: Frequency = { type: 'monthly', dates: [1] };
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-03-01');
        });

        it('handles -1 (last day of month)', () => {
            const freq: Frequency = { type: 'monthly', dates: [-1] };
            // From Feb 20, last day of Feb 2026 is Feb 28
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-02-28');
        });

        it('handles -1 when last day has passed – goes to next month', () => {
            const freq: Frequency = { type: 'monthly', dates: [-1] };
            // From Feb 28, next is March 31
            expect(calculateNextDue(freq, d('2026-02-28'))).toBe('2026-03-31');
        });

        it('handles multiple dates and picks the nearest future one', () => {
            const freq: Frequency = { type: 'monthly', dates: [1, 15, 28] };
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-02-28');
        });
    });

    // ---- after ----
    describe('after', () => {
        it('adds N days from completion date', () => {
            const freq: Frequency = { type: 'after', days: 7 };
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-02-27');
        });

        it('adds 0 days (same day)', () => {
            const freq: Frequency = { type: 'after', days: 0 };
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-02-20');
        });
    });

    // ---- every ----
    describe('every', () => {
        it('adds N days from the scheduled date (next_due)', () => {
            const freq: Frequency = { type: 'every', days: 7 };
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-02-27');
        });

        it('every 1 day advances by 1 from scheduled date', () => {
            const freq: Frequency = { type: 'every', days: 1 };
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-02-21');
        });
    });

    // ---- nth_day ----
    describe('nth_day', () => {
        it('finds first Friday of next month from Feb 20', () => {
            const freq: Frequency = { type: 'nth_day', instance: 1, day: 'Fri' };
            // Feb 20 is Friday → first Fri of March 2026 is March 6
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-03-06');
        });

        it('finds second Monday of the current month', () => {
            const freq: Frequency = { type: 'nth_day', instance: 2, day: 'Mon' };
            // 2nd Monday of Feb 2026 is Feb 9, which is in the past from Feb 20
            // → next: 2nd Monday of March 2026 = March 9
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-03-09');
        });

        it('finds last Saturday (-1)', () => {
            const freq: Frequency = { type: 'nth_day', instance: -1, day: 'Sat' };
            // Last Saturday of Feb 2026: Feb 28 is a Saturday
            // From Feb 20, Feb 28 is in the future
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-02-28');
        });

        it('finds last Saturday when current one has passed', () => {
            const freq: Frequency = { type: 'nth_day', instance: -1, day: 'Sat' };
            // From Feb 28 (last Sat of Feb), next is last Sat of March 2026 = March 28
            expect(calculateNextDue(freq, d('2026-02-28'))).toBe('2026-03-28');
        });
    });

    // ---- yearly ----
    describe('yearly', () => {
        it('finds next year if date has passed', () => {
            const freq: Frequency = { type: 'yearly', date: '01-01' };
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2027-01-01');
        });

        it('finds this year if date is in the future', () => {
            const freq: Frequency = { type: 'yearly', date: '12-25' };
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2026-12-25');
        });

        it('advances to next year when exactly on the date', () => {
            const freq: Frequency = { type: 'yearly', date: '02-20' };
            // baseDate is Feb 20, so next is Feb 20 next year
            expect(calculateNextDue(freq, d('2026-02-20'))).toBe('2027-02-20');
        });
    });
});
