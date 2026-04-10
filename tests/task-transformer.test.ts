import { describe, it, expect } from 'vitest';
import { adjustTaskTimeByMinutes, normalizeCompletedTaskActualDuration, transformCheckboxPress, transformTaskLine } from '../src/service/task-transformer';

describe('transformTaskLine Hour (h) Support', () => {
    const mockNow = new Date('2026-02-19T17:30:00');

    it('should taskify plain HH:mm + XXh text with quick-input normalization', () => {
        const result = transformTaskLine('13:00 読書 1.5h', mockNow);
        expect(result).toEqual({
            type: 'update',
            content: '- [ ] 13:00 - 読書 (90m)'
        });
    });

    it('should taskify plain hour estimate text with normalized estimate', () => {
        const result = transformTaskLine('大掃除 2.5h', mockNow);
        expect(result).toEqual({
            type: 'update',
            content: '- [ ] 大掃除 (150m)'
        });
    });

    it('should first add checkbox for a task with just an hour notation', () => {
        const result = transformTaskLine('Study 1h', mockNow);
        expect(result.content).toBe('- [ ] Study (60m)');
    });
});

describe('transformTaskLine quick-input parsing', () => {
    const mockNow = new Date('2026-02-19T17:30:00');

    it('parses planned time and bare minute estimate anywhere in the line', () => {
        const result = transformTaskLine('1200 打ち合わせ 10', mockNow);
        expect(result).toEqual({
            type: 'update',
            content: '- [ ] 12:00 - 打ち合わせ (10m)'
        });
    });

    it('uses only the leading time token as planned start', () => {
        const result = transformTaskLine('1200 打ち合わせ 1300 30 60', mockNow);
        expect(result).toEqual({
            type: 'update',
            content: '- [ ] 12:00 - 打ち合わせ 1300 60 (30m)'
        });
    });

    it('does not treat non-leading time-like tokens as planned start', () => {
        const result = transformTaskLine('打ち合わせ 1300 30m', mockNow);
        expect(result).toEqual({
            type: 'update',
            content: '- [ ] 打ち合わせ 1300 (30m)'
        });
    });

    it('treats invalid 4-digit numbers as title tokens', () => {
        const result = transformTaskLine('打ち合わせ 2960 10', mockNow);
        expect(result).toEqual({
            type: 'update',
            content: '- [ ] 打ち合わせ 2960 (10m)'
        });
    });

    it('keeps a trailing space when taskifying an empty line', () => {
        const result = transformTaskLine('', mockNow, 'taskify');
        expect(result).toEqual({
            type: 'update',
            content: '- [ ] '
        });
    });

    it('restores skip log lines to unchecked task lines', () => {
        const result = transformTaskLine('- skip: 09:00 [[朝のルーチン]] (15m)', mockNow);
        expect(result).toEqual({
            type: 'update',
            content: '- [ ] 09:00 - [[朝のルーチン]] (15m)'
        });
    });
});

describe('transformTaskLine retroComplete force action', () => {
    const mockNow = new Date('2026-02-19T17:30:00');

    it('retro-completes HH:mm + XXh text', () => {
        const result = transformTaskLine('13:00 読書 1.5h', mockNow, 'retroComplete');
        expect(result).toEqual({
            type: 'update',
            content: '- [x] 13:00 - 14:30 (90m) 読書'
        });
    });

    it('retro-completes HH:mm + Xm text', () => {
        const result = transformTaskLine('10:00 会議 1.11h', mockNow, 'retroComplete');
        expect(result?.content).toContain('(66m)');
    });

    it('returns null when duration is missing', () => {
        expect(transformTaskLine('13:00 読書', mockNow, 'retroComplete')).toBeNull();
    });
});

describe('transformTaskLine default toggle on completed task', () => {
    const mockNow = new Date('2026-02-19T17:30:00');

    it('duplicates completed task and writes remaining estimate without starting', () => {
        const result = transformTaskLine('- [x] 09:00 - 09:30 (30m) 読書', mockNow);
        expect(result).toEqual({
            type: 'insert',
            content: '- [ ] 読書'
        });
    });

    it('duplicates completed task with estimate>actual and subtracts actual from estimate', () => {
        const result = transformTaskLine('- [x] 09:00 - 09:20 (45m > 20m) 読書', mockNow);
        expect(result).toEqual({
            type: 'insert',
            content: '- [ ] 読書 (25m)'
        });
    });

    it('duplicates from drifted completed line using timestamp-based actual', () => {
        const result = transformTaskLine('- [x] 09:00 - 09:20 (45m > 10m) 読書', mockNow);
        expect(result).toEqual({
            type: 'insert',
            content: '- [ ] 読書 (25m)'
        });
    });

    it('clamps remaining estimate to zero when actual exceeds estimate', () => {
        const result = transformTaskLine('- [x] 09:00 - 09:50 (30m > 50m) 読書', mockNow);
        expect(result).toEqual({
            type: 'insert',
            content: '- [ ] 読書'
        });
    });
});

describe('normalizeCompletedTaskActualDuration', () => {
    it('recalculates actual side in estimate>actual format from timestamps', () => {
        const result = normalizeCompletedTaskActualDuration('- [x] 09:00 - 09:30 (45m > 10m) 読書');
        expect(result).toBe('- [x] 09:00 - 09:30 (45m > 30m) 読書');
    });

    it('recalculates single duration format from timestamps', () => {
        const result = normalizeCompletedTaskActualDuration('- [x] 09:00 - 09:30 (10m) 読書');
        expect(result).toBe('- [x] 09:00 - 09:30 (30m) 読書');
    });

    it('returns null when duration is already consistent', () => {
        const result = normalizeCompletedTaskActualDuration('- [x] 09:00 - 09:30 (30m) 読書');
        expect(result).toBeNull();
    });
});

describe('transformCheckboxPress', () => {
    const mockNow = new Date('2026-02-19T17:30:00');

    it('short press: unstarted -> running', () => {
        const result = transformCheckboxPress('- [ ] Review PR (30m)', mockNow, 'short');
        expect(result).toEqual({
            type: 'update',
            content: '- [/] 17:30 - Review PR (30m)'
        });
    });

    it('short press: dash-prefixed plain task -> running', () => {
        const result = transformCheckboxPress('- Review PR (30m)', mockNow, 'short');
        expect(result).toEqual({
            type: 'update',
            content: '- [/] 17:30 - Review PR (30m)'
        });
    });

    it('short press: unchecked task accepts 4-digit start and m estimate', () => {
        const result = transformCheckboxPress('- [ ] 1200 Review PR 15m', mockNow, 'short');
        expect(result).toEqual({
            type: 'update',
            content: '- [/] 12:00 - Review PR (15m)'
        });
    });

    it('short press: running -> complete', () => {
        const result = transformCheckboxPress('- [/] 17:00 - Review PR', mockNow, 'short');
        expect(result).toEqual({
            type: 'complete',
            content: ''
        });
    });

    it('long press: running -> unstarted (normalized)', () => {
        const result = transformCheckboxPress('- [/] 17:00 - Review PR', mockNow, 'long');
        expect(result).toEqual({
            type: 'update',
            content: '- [ ] 17:00 - Review PR'
        });
    });

    it('long press: running with estimate -> unstarted (keep time and estimate)', () => {
        const result = transformCheckboxPress('- [/] 17:00 - Review PR (45m)', mockNow, 'long');
        expect(result).toEqual({
            type: 'update',
            content: '- [ ] 17:00 - Review PR (45m)'
        });
    });

    it('long press: completed -> unstarted (drop actual timestamps, keep estimate)', () => {
        const result = transformCheckboxPress('- [x] 17:00 - 17:30 (30m) Review PR', mockNow, 'long');
        expect(result).toEqual({
            type: 'update',
            content: '- [ ] Review PR (30m)'
        });
    });

    it('long press: completed estimate>actual -> unstarted keeps estimate side', () => {
        const result = transformCheckboxPress('- [x] 17:00 - 17:25 (30m > 25m) Review PR', mockNow, 'long');
        expect(result).toEqual({
            type: 'update',
            content: '- [ ] Review PR (30m)'
        });
    });

    it('long press: unstarted -> running using supplied previous completion time', () => {
        const result = transformCheckboxPress('- [ ] 07:00 - Review PR (30m)', mockNow, 'long', {
            unstartedLongPressStartTime: '16:40'
        });
        expect(result).toEqual({
            type: 'update',
            content: '- [/] 16:40 - Review PR (30m)'
        });
    });

    it('indented line -> no-op', () => {
        const result = transformCheckboxPress('  - [ ] Child task', mockNow, 'short');
        expect(result).toBeNull();
    });
});

describe('adjustTaskTimeByMinutes', () => {
    it('moves the only timestamp back 1 minute for running tasks', () => {
        const result = adjustTaskTimeByMinutes('- [/] 17:00 - Review PR (30m)', -1);
        expect(result).toEqual({
            type: 'update',
            content: '- [/] 16:59 - Review PR (30m)'
        });
    });

    it('moves end time back 1 minute and recalculates duration for completed tasks', () => {
        const result = adjustTaskTimeByMinutes('- [x] 17:00 - 17:30 (30m) Review PR', -1);
        expect(result).toEqual({
            type: 'update',
            content: '- [x] 17:00 - 17:29 (29m) Review PR'
        });
    });

    it('recalculates only actual side for estimate>actual format', () => {
        const result = adjustTaskTimeByMinutes('- [x] 17:00 - 17:30 (45m > 30m) Review PR', -1);
        expect(result).toEqual({
            type: 'update',
            content: '- [x] 17:00 - 17:29 (45m > 29m) Review PR'
        });
    });

    it('returns null when no timestamp exists', () => {
        expect(adjustTaskTimeByMinutes('- [ ] Review PR', -1)).toBeNull();
    });
});
