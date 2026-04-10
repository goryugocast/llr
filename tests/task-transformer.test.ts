import { describe, expect, it } from 'vitest';
import {
    adjustTaskTimeByMinutes,
    getChecklistContentStartCh,
    normalizeCompletedTaskActualDuration,
    transformCheckboxPress,
    transformTaskLine,
} from '../src/service/task-transformer';

describe('task-transformer v2', () => {
    const mockNow = new Date('2026-02-19T17:30:00');

    describe('taskify / quick input', () => {
        it('normalizes planned start + estimate into v2 unchecked format', () => {
            const result = transformTaskLine('13:00 読書 1.5h', mockNow);
            expect(result).toEqual({
                type: 'update',
                content: '- [ ] 13:00 読書 (90m)',
            });
        });

        it('keeps only the leading time token as planned start', () => {
            const result = transformTaskLine('1200 打ち合わせ 1300 30 60', mockNow);
            expect(result).toEqual({
                type: 'update',
                content: '- [ ] 12:00 打ち合わせ 1300 60 (30m)',
            });
        });

        it('restores skip logs to unchecked v2 format', () => {
            const result = transformTaskLine('- skip: 09:00 [[朝のルーチン]] (15m)', mockNow);
            expect(result).toEqual({
                type: 'update',
                content: '- [ ] 09:00 [[朝のルーチン]] (15m)',
            });
        });
    });

    describe('cursor helpers', () => {
        it('returns the content start right after a running checklist prefix', () => {
            expect(getChecklistContentStartCh('- [/] 18:00 原稿修正 17:30 - (30m)')).toBe(6);
        });

        it('returns 0 when the line has no explicit checklist prefix', () => {
            expect(getChecklistContentStartCh('原稿修正')).toBe(0);
        });
    });

    describe('default toggle', () => {
        it('starts an unchecked task by appending actual start at line end', () => {
            const result = transformTaskLine('- [ ] 18:00 原稿修正 (30m)', mockNow);
            expect(result).toEqual({
                type: 'update',
                content: '- [/] 18:00 原稿修正 17:30 - (30m)',
            });
        });

        it('duplicates a completed task and keeps only the remaining estimate', () => {
            const result = transformTaskLine('- [x] 18:00 読書 18:12 - 18:35 (30m > 23m)', mockNow);
            expect(result).toEqual({
                type: 'insert',
                content: '- [ ] 18:00 読書 (7m)',
            });
        });

        it('drops actual-only duration when duplicating a completed task', () => {
            const result = transformTaskLine('- [x] 読書 18:12 - 18:35 (23m)', mockNow);
            expect(result).toEqual({
                type: 'insert',
                content: '- [ ] 読書',
            });
        });
    });

    describe('retroComplete', () => {
        it('retro-completes from planned start + estimate in v2 format', () => {
            const result = transformTaskLine('13:00 読書 1.5h', mockNow, 'retroComplete');
            expect(result).toEqual({
                type: 'update',
                content: '- [x] 13:00 読書 13:00 - 14:30 (90m)',
            });
        });

        it('returns null when duration is missing', () => {
            expect(transformTaskLine('13:00 読書', mockNow, 'retroComplete')).toBeNull();
        });
    });

    describe('normalizeCompletedTaskActualDuration', () => {
        it('recalculates the actual side from timestamps', () => {
            const result = normalizeCompletedTaskActualDuration('- [x] 18:00 Review PR 17:00 - 17:30 (45m > 10m)');
            expect(result).toBe('- [x] 18:00 Review PR 17:00 - 17:30 (45m > 30m)');
        });

        it('recalculates single-duration completed lines', () => {
            const result = normalizeCompletedTaskActualDuration('- [x] Review PR 17:00 - 17:30 (10m)');
            expect(result).toBe('- [x] Review PR 17:00 - 17:30 (30m)');
        });

        it('returns null when the line is already consistent', () => {
            const result = normalizeCompletedTaskActualDuration('- [x] Review PR 17:00 - 17:30 (30m)');
            expect(result).toBeNull();
        });
    });

    describe('transformCheckboxPress', () => {
        it('short press starts an unchecked task', () => {
            const result = transformCheckboxPress('- [ ] Review PR (30m)', mockNow, 'short');
            expect(result).toEqual({
                type: 'update',
                content: '- [/] Review PR 17:30 - (30m)',
            });
        });

        it('short press starts a dash-prefixed plain task after taskify normalization', () => {
            const result = transformCheckboxPress('- Review PR (30m)', mockNow, 'short');
            expect(result).toEqual({
                type: 'update',
                content: '- [/] Review PR 17:30 - (30m)',
            });
        });

        it('short press on a planned task preserves planned start in the body', () => {
            const result = transformCheckboxPress('- [ ] 1200 Review PR 15m', mockNow, 'short');
            expect(result).toEqual({
                type: 'update',
                content: '- [/] 12:00 Review PR 17:30 - (15m)',
            });
        });

        it('short press completes a running task', () => {
            const result = transformCheckboxPress('- [/] Review PR 17:00 - (30m)', mockNow, 'short');
            expect(result).toEqual({
                type: 'complete',
                content: '',
            });
        });

        it('long press resets a running task and drops actual times only', () => {
            const result = transformCheckboxPress('- [/] 18:00 Review PR 17:00 - (45m)', mockNow, 'long');
            expect(result).toEqual({
                type: 'update',
                content: '- [ ] 18:00 Review PR (45m)',
            });
        });

        it('long press resets a completed task and keeps the estimate side', () => {
            const result = transformCheckboxPress('- [x] 18:00 Review PR 17:00 - 17:25 (30m > 25m)', mockNow, 'long');
            expect(result).toEqual({
                type: 'update',
                content: '- [ ] 18:00 Review PR (30m)',
            });
        });

        it('long press starts an unchecked task from the supplied previous completion time', () => {
            const result = transformCheckboxPress('- [ ] 07:00 Review PR (30m)', mockNow, 'long', {
                unstartedLongPressStartTime: '16:40',
            });
            expect(result).toEqual({
                type: 'update',
                content: '- [/] 07:00 Review PR 16:40 - (30m)',
            });
        });
    });

    describe('adjustTaskTimeByMinutes', () => {
        it('moves running actual start by 1 minute', () => {
            const result = adjustTaskTimeByMinutes('- [/] Review PR 17:00 - (30m)', -1);
            expect(result).toEqual({
                type: 'update',
                content: '- [/] Review PR 16:59 - (30m)',
            });
        });

        it('moves completed end time and recalculates duration', () => {
            const result = adjustTaskTimeByMinutes('- [x] Review PR 17:00 - 17:30 (30m)', -1);
            expect(result).toEqual({
                type: 'update',
                content: '- [x] Review PR 17:00 - 17:29 (29m)',
            });
        });

        it('moves planned start for unchecked tasks', () => {
            const result = adjustTaskTimeByMinutes('- [ ] 18:00 Review PR (30m)', -1);
            expect(result).toEqual({
                type: 'update',
                content: '- [ ] 17:59 Review PR (30m)',
            });
        });

        it('returns null when no adjustable time exists', () => {
            expect(adjustTaskTimeByMinutes('- [ ] Review PR', -1)).toBeNull();
        });
    });
});
