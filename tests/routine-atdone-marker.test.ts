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
    });

    it('supports full-width at-sign markers', () => {
        expect(replacePendingRoutineAtDoneMarker('- [x] [[朝の仕込み]] ＠done'))
            .toBe('- [x] [[朝の仕込み]] →done');
    });

    it('returns null when there is no pending @done marker', () => {
        expect(replacePendingRoutineAtDoneMarker('- [x] [[朝の仕込み]] →done')).toBeNull();
    });
});
