import { describe, expect, it } from 'vitest';
import { selectReflectionCandidates } from '../src/service/reflection-candidates';

const candidate = (id: number, estimate = 0) => ({ id, estimate });
describe('section hourly candidates', () => {
    it('fills available hours from the top for zero estimates, without repetition', () => {
        expect([...selectReflectionCandidates([candidate(0), candidate(1), candidate(2), candidate(3)], [14, 15]).values()]).toEqual([0, 1]);
        expect([...selectReflectionCandidates([candidate(0)], [14, 15, 16]).values()]).toEqual([0]);
    });
    it('selects by estimate but displays selected candidates in original order', () => {
        expect([...selectReflectionCandidates([candidate(0, 5), candidate(1, 60), candidate(2, 30)], [21, 22]).values()]).toEqual([1, 2]);
        expect([...selectReflectionCandidates([candidate(0, 30), candidate(1, 60), candidate(2, 5)], [21, 22]).values()]).toEqual([0, 1]);
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
