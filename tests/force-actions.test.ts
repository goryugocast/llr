import { describe, expect, it } from 'vitest';
import { transformTaskLine } from '../src/service/task-transformer';

describe('transformTaskLine force actions (v2)', () => {
    const mockNow = new Date('2026-02-19T17:30:00');

    describe('start', () => {
        it('starts an unchecked task by writing actual start at the tail', () => {
            const result = transformTaskLine('- [ ] Task A', mockNow, 'start');
            expect(result).toEqual({
                type: 'update',
                content: '- [/] Task A 17:30 -',
            });
        });

        it('starts a plain task after taskify normalization', () => {
            const result = transformTaskLine('- Task A', mockNow, 'start');
            expect(result).toEqual({
                type: 'update',
                content: '- [/] Task A 17:30 -',
            });
        });

        it('keeps the planned start token in the body and uses now as actual start', () => {
            const result = transformTaskLine('- [ ] 12:00 Task A (15m)', mockNow, 'start');
            expect(result).toEqual({
                type: 'update',
                content: '- [/] 12:00 Task A 17:30 - (15m)',
            });
        });

        it('restarts a completed task as a new running line', () => {
            const result = transformTaskLine('- [x] 12:00 Task A 12:00 - 13:00 (60m)', mockNow, 'start');
            expect(result).toEqual({
                type: 'insert',
                content: '- [/] 12:00 Task A 17:30 -',
            });
        });
    });

    describe('complete', () => {
        it('completes a running task', () => {
            const result = transformTaskLine('- [/] Task A 17:00 -', mockNow, 'complete');
            expect(result).toEqual({
                type: 'complete',
                content: '',
            });
        });

        it('returns null for non-running lines', () => {
            expect(transformTaskLine('- [ ] Task A', mockNow, 'complete')).toBeNull();
            expect(transformTaskLine('- [x] Task A 17:00 - 17:20 (20m)', mockNow, 'complete')).toBeNull();
        });
    });

    describe('interrupt', () => {
        it('interrupts a running task and carries remaining estimate into a followup task', () => {
            const result = transformTaskLine('- [/] 12:00 Task A 17:00 - (45m)', mockNow, 'interrupt');
            expect(result).toEqual({
                type: 'interrupt',
                content: '- [x] 12:00 Task A 17:00 - 17:30 (45m > 30m)',
                extraContent: '- [ ] 12:00 Task A (15m)',
            });
        });

        it('returns null for non-running lines', () => {
            expect(transformTaskLine('- [ ] Task A', mockNow, 'interrupt')).toBeNull();
        });
    });

    describe('duplicate', () => {
        it('duplicates an unchecked line as another unchecked line', () => {
            const result = transformTaskLine('- [ ] Task A', mockNow, 'duplicate');
            expect(result).toEqual({
                type: 'insert',
                content: '- [ ] Task A',
            });
        });

        it('duplicates a completed line with remaining estimate', () => {
            const result = transformTaskLine('- [x] Task B 10:00 - 10:20 (45m > 20m)', mockNow, 'duplicate');
            expect(result).toEqual({
                type: 'insert',
                content: '- [ ] Task B (25m)',
            });
        });

        it('returns null for a plain line without checkbox', () => {
            expect(transformTaskLine('- Task A', mockNow, 'duplicate')).toBeNull();
        });
    });

    describe('interrupt edge cases', () => {
        it('creates a followup with no estimate when the original has none', () => {
            const result = transformTaskLine('- [/] Task A 17:00 -', mockNow, 'interrupt');
            expect(result).toEqual({
                type: 'interrupt',
                content: '- [x] Task A 17:00 - 17:30 (30m)',
                extraContent: '- [ ] Task A',
            });
        });

        it('returns null for a running task without actual start time', () => {
            expect(transformTaskLine('- [/] Task A (30m)', mockNow, 'interrupt')).toBeNull();
        });

        it('returns null for a plain line', () => {
            expect(transformTaskLine('- Task A', mockNow, 'interrupt')).toBeNull();
        });

        it('returns null for a completed line', () => {
            expect(transformTaskLine('- [x] Task 10:00 - 10:30 (30m)', mockNow, 'interrupt')).toBeNull();
        });
    });

    describe('taskify', () => {
        it('converts a plain line into an unchecked checkbox line', () => {
            const result = transformTaskLine('- Task A', mockNow, 'taskify');
            expect(result).toEqual({
                type: 'update',
                content: '- [ ] Task A',
            });
        });

        it('returns null when the line already has a checkbox', () => {
            expect(transformTaskLine('- [ ] Task A', mockNow, 'taskify')).toBeNull();
        });
    });

    describe('start edge cases', () => {
        it('returns null when trying to start an already-running task', () => {
            expect(transformTaskLine('- [/] Task 17:00 -', mockNow, 'start')).toBeNull();
        });
    });

    describe('complete edge cases', () => {
        it('returns null for a plain line without checkbox', () => {
            expect(transformTaskLine('- Task A', mockNow, 'complete')).toBeNull();
        });
    });

    describe('indented lines', () => {
        it('returns null for indented lines regardless of action', () => {
            expect(transformTaskLine('  - [ ] Task', mockNow, 'start')).toBeNull();
            expect(transformTaskLine('  - [/] Task 17:00 -', mockNow, 'complete')).toBeNull();
            expect(transformTaskLine('  - [ ] Task', mockNow)).toBeNull();
        });
    });
});
