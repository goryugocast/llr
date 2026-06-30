import { describe, it, expect } from 'vitest';
import {
    normalizeCutoffTimeHHmm,
    parseCutoffMinutes,
    normalizeMinutesForCutoffTimeline,
} from '../src/service/day-cutoff';

describe('day-cutoff', () => {
    describe('normalizeCutoffTimeHHmm', () => {
        it('returns a valid 4-digit time as-is', () => {
            expect(normalizeCutoffTimeHHmm('0300')).toBe('0300');
            expect(normalizeCutoffTimeHHmm('2359')).toBe('2359');
            expect(normalizeCutoffTimeHHmm('0000')).toBe('0000');
        });

        it('falls back to 0300 for non-4-digit strings', () => {
            expect(normalizeCutoffTimeHHmm('03:00')).toBe('0300');
            expect(normalizeCutoffTimeHHmm('abc')).toBe('0300');
            expect(normalizeCutoffTimeHHmm('12345')).toBe('0300');
            expect(normalizeCutoffTimeHHmm('12')).toBe('0300');
            expect(normalizeCutoffTimeHHmm('')).toBe('0300');
        });

        it('falls back to 0300 for out-of-range hours or minutes', () => {
            expect(normalizeCutoffTimeHHmm('2400')).toBe('0300');
            expect(normalizeCutoffTimeHHmm('0060')).toBe('0300');
            expect(normalizeCutoffTimeHHmm('2560')).toBe('0300');
        });

        it('falls back to 0300 when called with no argument', () => {
            expect(normalizeCutoffTimeHHmm()).toBe('0300');
        });
    });

    describe('parseCutoffMinutes', () => {
        it('converts valid HHMM to total minutes', () => {
            expect(parseCutoffMinutes('0300')).toBe(180);
            expect(parseCutoffMinutes('0000')).toBe(0);
            expect(parseCutoffMinutes('2359')).toBe(1439);
            expect(parseCutoffMinutes('1230')).toBe(750);
        });

        it('normalizes invalid input before parsing', () => {
            expect(parseCutoffMinutes('invalid')).toBe(180);
        });

        it('uses default when called with no argument', () => {
            expect(parseCutoffMinutes()).toBe(180);
        });
    });

    describe('normalizeMinutesForCutoffTimeline', () => {
        it('returns minutes unchanged when at or after the cutoff', () => {
            expect(normalizeMinutesForCutoffTimeline(180, '0300')).toBe(180);
            expect(normalizeMinutesForCutoffTimeline(600, '0300')).toBe(600);
            expect(normalizeMinutesForCutoffTimeline(1439, '0300')).toBe(1439);
        });

        it('adds 1440 to minutes before the cutoff', () => {
            expect(normalizeMinutesForCutoffTimeline(0, '0300')).toBe(1440);
            expect(normalizeMinutesForCutoffTimeline(179, '0300')).toBe(1619);
        });

        it('handles cutoff at midnight (0000) where nothing wraps', () => {
            expect(normalizeMinutesForCutoffTimeline(0, '0000')).toBe(0);
            expect(normalizeMinutesForCutoffTimeline(100, '0000')).toBe(100);
        });

        it('uses the default cutoff (0300) when no argument is passed', () => {
            expect(normalizeMinutesForCutoffTimeline(100)).toBe(100 + 1440);
            expect(normalizeMinutesForCutoffTimeline(200)).toBe(200);
        });
    });
});
