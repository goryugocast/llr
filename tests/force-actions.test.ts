import { describe, it, expect } from 'vitest';
import { transformTaskLine } from '../src/service/task-transformer';

describe('transformTaskLine Force Actions', () => {
    const mockNow = new Date('2026-02-19T17:30:00');

    describe('Force: Start', () => {
        it('should start an unstarted task', () => {
            const line = '- [ ] Task A';
            const result = transformTaskLine(line, mockNow, 'start');
            expect(result?.type).toBe('update');
            expect(result?.content).toBe('- [/] 17:30 - Task A');
        });

        it('should start a dash-prefixed plain task', () => {
            const line = '- Task A';
            const result = transformTaskLine(line, mockNow, 'start');
            expect(result?.type).toBe('update');
            expect(result?.content).toBe('- [/] 17:30 - Task A');
        });

        it('should normalize 4-digit start and m estimate when force starting', () => {
            const line = '- [ ] 1200 Task A 15m';
            const result = transformTaskLine(line, mockNow, 'start');
            expect(result?.type).toBe('update');
            expect(result?.content).toBe('- [/] 12:00 - Task A (15m)');
        });

        it('should preserve planned time when force starting', () => {
            const line = '- [ ] 07:30 - Task A';
            const result = transformTaskLine(line, mockNow, 'start');
            expect(result?.type).toBe('update');
            expect(result?.content).toBe('- [/] 07:30 - Task A');
        });

        it('should return null if already running (Safety)', () => {
            const line = '- [/] 12:00 - Task A';
            const result = transformTaskLine(line, mockNow, 'start');
            expect(result).toBeNull();
        });

        it('should restart (clone) if already done', () => {
            const line = '- [x] 12:00 - 13:00 (60m) Task A';
            const result = transformTaskLine(line, mockNow, 'start');
            expect(result?.type).toBe('insert');
            expect(result?.content).toBe('- [/] 17:30 - Task A');
        });
    });

    describe('Force: Complete', () => {
        it('should complete a running task', () => {
            const line = '- [/] 17:00 - Task A';
            const result = transformTaskLine(line, mockNow, 'complete');
            expect(result?.type).toBe('complete');
            expect(result?.content).toBe('');
        });

        it('should return null if not running', () => {
            const line = '- [ ] Task A';
            expect(transformTaskLine(line, mockNow, 'complete')).toBeNull();

            const line2 = '- [x] Done';
            expect(transformTaskLine(line2, mockNow, 'complete')).toBeNull();
        });
    });

    describe('Force: Interrupt', () => {
        it('should interrupt a running task', () => {
            const line = '- [/] 17:00 - Task A';
            const result = transformTaskLine(line, mockNow, 'interrupt');
            expect(result).toEqual({
                type: 'interrupt',
                content: '- [x] 17:00 - 17:30 (30m) Task A',
                extraContent: '- [ ] Task A'
            });
        });

        it('should return null if not running', () => {
            const line = '- [ ] Task A';
            expect(transformTaskLine(line, mockNow, 'interrupt')).toBeNull();
        });
    });

    describe('Force: Duplicate', () => {
        it('should always clone without starting', () => {
            const line1 = '- [ ] Task A';
            const res1 = transformTaskLine(line1, mockNow, 'duplicate');
            expect(res1?.type).toBe('insert');
            expect(res1?.content).toBe('- [ ] Task A');

            const line2 = '- [x] 10:00 - 11:00 (60m) Task B';
            const res2 = transformTaskLine(line2, mockNow, 'duplicate');
            expect(res2?.type).toBe('insert');
            expect(res2?.content).toBe('- [ ] Task B');
        });
    });
});
