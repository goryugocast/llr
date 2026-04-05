import { describe, expect, it } from 'vitest';
import { parseRoutineRescheduleMarker, replaceRoutineRescheduleMarker } from '../src/service/routine-reschedule-marker';

describe('routine-reschedule-marker', () => {
    const baseDate = new Date('2026-04-05T10:00:00');

    it('parses a compact MMDD marker', () => {
        const parsed = parseRoutineRescheduleMarker('- [ ] [[花粉症の薬]] @0501', baseDate);
        expect(parsed?.canonicalDate).toBe('2026-05-01');
    });

    it('parses a slash marker', () => {
        const parsed = parseRoutineRescheduleMarker('- [x] [[花粉症の薬]] @5/1', baseDate);
        expect(parsed?.canonicalDate).toBe('2026-05-01');
    });

    it('parses a Japanese marker with full-width at-sign', () => {
        const parsed = parseRoutineRescheduleMarker('- skip: [[花粉症の薬]] ＠5月1日', baseDate);
        expect(parsed?.canonicalDate).toBe('2026-05-01');
    });

    it('rolls month/day markers into the next year when this year has already passed', () => {
        const parsed = parseRoutineRescheduleMarker('- [ ] [[花粉症の薬]] @3/1', baseDate);
        expect(parsed?.canonicalDate).toBe('2027-03-01');
    });

    it('accepts explicit ISO dates within one year', () => {
        const parsed = parseRoutineRescheduleMarker('- [ ] [[花粉症の薬]] @2026-06-01', baseDate);
        expect(parsed?.canonicalDate).toBe('2026-06-01');
    });

    it('rejects markers that are not in the future', () => {
        expect(parseRoutineRescheduleMarker('- [ ] [[花粉症の薬]] @0405', baseDate)?.canonicalDate).toBe('2027-04-05');
        expect(parseRoutineRescheduleMarker('- [ ] [[花粉症の薬]] @4/5', baseDate)?.canonicalDate).toBe('2027-04-05');
        expect(parseRoutineRescheduleMarker('- [ ] [[花粉症の薬]] @2026-04-01', baseDate)).toBeNull();
        expect(parseRoutineRescheduleMarker('- [ ] [[花粉症の薬]] @2026-04-05', baseDate)).toBeNull();
    });

    it('rejects markers beyond one year', () => {
        expect(parseRoutineRescheduleMarker('- [ ] [[花粉症の薬]] @2027-05-10', baseDate)).toBeNull();
    });

    it('rejects lines with multiple candidate markers', () => {
        expect(parseRoutineRescheduleMarker('- [ ] [[花粉症の薬]] @0501 @0502', baseDate)).toBeNull();
    });

    it('rewrites a pending marker to a processed arrow marker', () => {
        const parsed = parseRoutineRescheduleMarker('- [ ] [[花粉症の薬]] @0501', baseDate);
        expect(parsed).not.toBeNull();
        expect(replaceRoutineRescheduleMarker('- [ ] [[花粉症の薬]] @0501', parsed!))
            .toBe('- [ ] [[花粉症の薬]] →2026-05-01');
    });
});
