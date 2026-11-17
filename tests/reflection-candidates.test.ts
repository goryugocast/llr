import { describe, expect, it } from 'vitest';
import { selectReflectionCandidates } from '../src/service/reflection-candidates';

const candidate = (id: number, estimate = 0) => ({ id, estimate });
describe('section hourly candidates', () => {
    it('compares full section estimates with fixed-time overlap, not section overlap', () => {
        const result = selectReflectionCandidates([
            { id: 0, estimate: 0, startMinute: 13 * 60 + 30, endMinute: 17 * 60 + 30 },
            { id: 1, estimate: 70, startMinute: 17 * 60 + 30, endMinute: 18 * 60 },
            { id: 2, estimate: 70, startMinute: 17 * 60 + 50, endMinute: 19 * 60, fixed: true },
        ], [17, 18]);
        expect([...result.values()]).toEqual([1, 2]);
    });
    it('limits continuation and yields borderline remainders to other candidates', () => {
        expect([...selectReflectionCandidates([candidate(0, 95), candidate(1, 5)], [21, 22, 23]).values()]).toEqual([0, 1]);
        expect([...selectReflectionCandidates([candidate(0, 95)], [21, 22, 23]).values()]).toEqual([0, 0]);
        expect([...selectReflectionCandidates([candidate(0, 190), candidate(1)], [14, 15, 16, 17]).values()]).toEqual([0, 0, 0, 1]);
        expect([...selectReflectionCandidates([candidate(0, 230), candidate(1)], [14, 15, 16, 17, 18]).values()]).toEqual([0, 0, 0, 0, 1]);
    });
    it('fills available hours from the top for zero estimates, without repetition', () => {
        expect([...selectReflectionCandidates([candidate(0), candidate(1), candidate(2), candidate(3)], [14, 15]).values()]).toEqual([0, 1]);
        expect([...selectReflectionCandidates([candidate(0)], [14, 15, 16]).values()]).toEqual([0]);
    });
    it('selects each hour by remaining estimate', () => {
        expect([...selectReflectionCandidates([candidate(0, 5), candidate(1, 60), candidate(2, 30)], [21, 22]).values()]).toEqual([1, 2]);
        expect([...selectReflectionCandidates([candidate(0, 30), candidate(1, 60), candidate(2, 5)], [21, 22]).values()]).toEqual([1, 0]);
    });
    it('promotes remaining candidates after completion and shrinks the selection as time passes', () => {
        expect([...selectReflectionCandidates([candidate(1), candidate(2), candidate(3)], [15, 16]).values()]).toEqual([1, 2]);
        expect([...selectReflectionCandidates([candidate(1), candidate(2), candidate(3)], [16]).values()]).toEqual([1]);
    });
    it('uses consecutive hours for long estimates and never bridges an occupied hour', () => {
        expect([...selectReflectionCandidates([candidate(0, 120), candidate(1, 30)], [14, 15, 16]).entries()]).toEqual([[14, 0], [15, 0], [16, 1]]);
        expect([...selectReflectionCandidates([candidate(0, 120), candidate(1, 30)], [14, 16]).entries()]).toEqual([[14, 0], [16, 1]]);
        expect([...selectReflectionCandidates([candidate(0, 120), candidate(1, 30)], [14, 16, 17]).entries()]).toEqual([[14, 0], [16, 1]]);
    });
    it('caps a long candidate at the remaining capacity and keeps source order for estimate ties', () => {
        expect([...selectReflectionCandidates([candidate(0, 180), candidate(1, 60)], [14, 15]).values()]).toEqual([0, 0]);
        expect([...selectReflectionCandidates([candidate(0, 30), candidate(1, 30)], [14]).values()]).toEqual([0]);
        expect(selectReflectionCandidates([candidate(0)], []).size).toBe(0);
    });
});
