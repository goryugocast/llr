import { describe, it, expect } from 'vitest';
import { advanceDueUntil, type Frequency } from '../src/service/yaml-parser';

/**
 * Characterization tests for the shared "catch-up" loop extracted from
 * routine-engine's three near-identical loops (due-anchor completion, display,
 * preview). The loop advances a YYYY-MM-DD due date by `frequency` strides until
 * it reaches `threshold`; `inclusive` toggles `>=` (display/preview) vs `>`
 * (due-anchor completion). The frequency-specific stride is calculateNextDue's
 * job (covered elsewhere); here we lock the loop + comparison semantics using
 * pure-arithmetic frequencies (daily / every).
 */
describe('advanceDueUntil', () => {
    const daily: Frequency = { type: 'daily', interval: 1 };
    const every3: Frequency = { type: 'every', days: 3 };

    describe('inclusive = true (display / preview: stop at >= threshold)', () => {
        it('returns the start date unchanged when already at the threshold', () => {
            expect(advanceDueUntil(daily, '2026-02-25', '2026-02-25', true)).toBe('2026-02-25');
        });

        it('returns the start date unchanged when already past the threshold', () => {
            expect(advanceDueUntil(daily, '2026-02-27', '2026-02-25', true)).toBe('2026-02-27');
        });

        it('advances day-by-day up to and including the threshold', () => {
            expect(advanceDueUntil(daily, '2026-02-20', '2026-02-25', true)).toBe('2026-02-25');
        });

        it('advances by stride and stops on the first date at or past the threshold', () => {
            // 02-20 -> 02-23 -> 02-26 (>= 02-26)
            expect(advanceDueUntil(every3, '2026-02-20', '2026-02-26', true)).toBe('2026-02-26');
        });

        it('overshoots when the stride steps over the threshold', () => {
            // 02-20 -> 02-23 -> 02-26 (first >= 02-25)
            expect(advanceDueUntil(every3, '2026-02-20', '2026-02-25', true)).toBe('2026-02-26');
        });
    });

    describe('inclusive = false (due-anchor completion: stop at > threshold)', () => {
        it('returns the start date unchanged when already strictly past the threshold', () => {
            expect(advanceDueUntil(daily, '2026-02-27', '2026-02-25', false)).toBe('2026-02-27');
        });

        it('advances one stride when the start date equals the threshold', () => {
            // equal is not strictly future, so it must advance once
            expect(advanceDueUntil(daily, '2026-02-25', '2026-02-25', false)).toBe('2026-02-26');
        });

        it('advances day-by-day until strictly past the threshold', () => {
            // 02-20 ... 02-25 (==, not past) -> 02-26
            expect(advanceDueUntil(daily, '2026-02-20', '2026-02-25', false)).toBe('2026-02-26');
        });

        it('advances by stride until strictly past the threshold', () => {
            // 02-20 -> 02-23 -> 02-26 (02-26 > 02-26? no) -> 03-01 (2026 is NOT a leap year)
            expect(advanceDueUntil(every3, '2026-02-20', '2026-02-26', false)).toBe('2026-03-01');
        });
    });

    describe('null stride (frequency none)', () => {
        const none: Frequency = { type: 'none' };

        it('returns null when a stride is needed but yields null', () => {
            expect(advanceDueUntil(none, '2026-02-20', '2026-02-25', true)).toBeNull();
        });

        it('returns the start date when the threshold is already reached (no stride needed)', () => {
            expect(advanceDueUntil(none, '2026-02-26', '2026-02-25', true)).toBe('2026-02-26');
        });
    });

    describe('month boundary crossing', () => {
        it('advances across a month boundary correctly', () => {
            // daily from 02-26 to >= 03-02
            expect(advanceDueUntil(daily, '2026-02-26', '2026-03-02', true)).toBe('2026-03-02');
        });
    });
});
