import { describe, expect, it } from 'vitest';
import {
    hasAnyRoutineAtDoneMarker,
    hasPendingRoutineAtDoneMarker,
    hasProcessedRoutineAtDoneMarker,
    replacePendingRoutineAtDoneMarker,
} from '../src/service/routine-atdone-marker';

describe('routine-atdone-marker', () => {
    it('detects a pending @done marker', () => {
        expect(hasPendingRoutineAtDoneMarker('- [x] [[朝の仕込み]] @done')).toBe(true);
        expect(hasPendingRoutineAtDoneMarker('- [ ] [[朝の仕込み]] @done')).toBe(true);
    });

    it('detects a processed arrow marker', () => {
        expect(hasProcessedRoutineAtDoneMarker('- [x] [[朝の仕込み]] →done')).toBe(true);
    });

    it('treats either pending or processed markers as an atdone marker', () => {
        expect(hasAnyRoutineAtDoneMarker('- [x] [[朝の仕込み]] @done')).toBe(true);
        expect(hasAnyRoutineAtDoneMarker('- [x] [[朝の仕込み]] →done')).toBe(true);
    });

    it('rewrites a pending @done marker to a processed arrow marker', () => {
        expect(replacePendingRoutineAtDoneMarker('- [x] [[朝の仕込み]] @done'))
            .toBe('- [x] [[朝の仕込み]] →done');
        expect(replacePendingRoutineAtDoneMarker('- [ ] [[朝の仕込み]] @done'))
            .toBe('- [ ] [[朝の仕込み]] →done');
    });

    it('supports full-width at-sign markers', () => {
        expect(replacePendingRoutineAtDoneMarker('- [x] [[朝の仕込み]] ＠done'))
            .toBe('- [x] [[朝の仕込み]] →done');
    });

    it('returns null when there is no pending @done marker', () => {
        expect(replacePendingRoutineAtDoneMarker('- [x] [[朝の仕込み]] →done')).toBeNull();
    });

    it('detects @done even with trailing text (word boundary match)', () => {
        expect(hasPendingRoutineAtDoneMarker('- [x] [[Task]] @done extra')).toBe(true);
    });

    it('rejects @done embedded in a word without whitespace prefix', () => {
        expect(hasPendingRoutineAtDoneMarker('- [x] email@done.com')).toBe(false);
    });

    it('handles @done as the only content', () => {
        expect(hasPendingRoutineAtDoneMarker('@done')).toBe(true);
    });

    it('is case insensitive', () => {
        expect(hasPendingRoutineAtDoneMarker('- [x] Task @DONE')).toBe(true);
        expect(hasPendingRoutineAtDoneMarker('- [x] Task @Done')).toBe(true);
    });

    it('returns null for lines with no markers at all', () => {
        expect(replacePendingRoutineAtDoneMarker('- [x] [[朝の仕込み]]')).toBeNull();
    });
});
