import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoutineEngine } from '../src/service/routine-engine';
import { TFile } from 'obsidian';

vi.mock('obsidian', () => ({
    TFile: class { },
    App: class { },
    Notice: class { },
}));

describe('SRS completion', () => {
    let mockApp: any;
    let engine: RoutineEngine;

    const makeFile = (path: string): TFile => {
        const file = new (TFile as any)() as TFile;
        (file as any).path = path;
        (file as any).extension = 'md';
        return file;
    };

    beforeEach(() => {
        mockApp = {
            metadataCache: {
                getFirstLinkpathDest: vi.fn(),
                getFileCache: vi.fn(),
            },
            fileManager: {
                processFrontMatter: vi.fn(),
            },
            vault: {
                getFolderByPath: vi.fn(),
                read: vi.fn(),
            },
        };
        engine = new RoutineEngine(mockApp as any);
    });

    describe('SRS folder recognition', () => {
        it('resolveRoutineFile should resolve a file in srs/ folder', () => {
            const mockFile = makeFile('srs/振り返りノート.md');
            mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);

            const resolved = engine.resolveRoutineFile('振り返りノート', 'daily/2026-06-30.md');
            expect(resolved).toBe(mockFile);
        });

        it('resolveRoutineFile should reject files in subfolders of srs/', () => {
            const mockFile = makeFile('srs/sub/deep.md');
            mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);

            const resolved = engine.resolveRoutineFile('deep', 'daily/2026-06-30.md');
            expect(resolved).toBeNull();
        });

        it('resolveRoutineFile should still resolve routine/ files', () => {
            const mockFile = makeFile('routine/朝のルーチン.md');
            mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);

            const resolved = engine.resolveRoutineFile('朝のルーチン', 'daily/2026-06-30.md');
            expect(resolved).toBe(mockFile);
        });

        it('resolveRoutineFile should reject files outside both routine/ and srs/', () => {
            const mockFile = makeFile('notes/メモ.md');
            mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);

            const resolved = engine.resolveRoutineFile('メモ', 'daily/2026-06-30.md');
            expect(resolved).toBeNull();
        });

        it('fetchDueRoutines should include srs/ notes that are due today', () => {
            const srsFile = makeFile('srs/復習A.md');
            const srsFolder = {
                children: [srsFile],
            };
            const routineFolder = {
                children: [] as any[],
            };
            mockApp.vault.getFolderByPath.mockImplementation((path: string) => {
                if (path === 'routine') return routineFolder;
                if (path === 'srs') return srsFolder;
                return null;
            });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 3, next_due: '2026-06-30' },
            });

            const today = new Date('2026-06-30T10:00:00');
            const results = engine.fetchDueRoutines(today);

            expect(results.some(r => r.file.path === 'srs/復習A.md')).toBe(true);
        });

        it('fetchDueRoutines should return both routine/ and srs/ notes together', () => {
            const routineFile = makeFile('routine/毎日の運動.md');
            const srsFile = makeFile('srs/復習B.md');
            mockApp.vault.getFolderByPath.mockImplementation((path: string) => {
                if (path === 'routine') return { children: [routineFile] };
                if (path === 'srs') return { children: [srsFile] };
                return null;
            });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 1, next_due: '2026-06-30' },
            });

            const today = new Date('2026-06-30T10:00:00');
            const results = engine.fetchDueRoutines(today);

            expect(results).toHaveLength(2);
            expect(results.some(r => r.file.path === 'routine/毎日の運動.md')).toBe(true);
            expect(results.some(r => r.file.path === 'srs/復習B.md')).toBe(true);
        });
    });

    describe('SRS completion grows interval', () => {
        it('should use current repeat for next_due, then grow repeat for next time', async () => {
            const mockFile = makeFile('srs/テスト.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 3, next_due: '2026-06-30' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            expect(updateSpy).toHaveBeenCalled();
            const args = updateSpy.mock.calls[0][1];

            // next_due uses current repeat (3): today + 3 = 2026-07-03
            expect(args.nextDue).toBe('2026-07-03');

            // repeat grows to 3 * 2~3 = 6~9 for next time
            expect(typeof args.repeat).toBe('number');
            expect(Number.isInteger(args.repeat)).toBe(true);
            expect(args.repeat).toBeGreaterThanOrEqual(6);
            expect(args.repeat).toBeLessThanOrEqual(9);
        });

        it('should grow repeat: 1 to 2 or 3, with next_due 1 day later', async () => {
            const mockFile = makeFile('srs/初回.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 1, next_due: '2026-06-30' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            // next_due uses current repeat (1): tomorrow
            expect(args.nextDue).toBe('2026-07-01');
            // repeat grows for next time
            expect(args.repeat).toBeGreaterThanOrEqual(2);
            expect(args.repeat).toBeLessThanOrEqual(3);
        });

        it('should always produce integer repeat even after multiple growth cycles', async () => {
            let currentRepeat = 1;

            for (let i = 0; i < 4; i++) {
                const mockFile = makeFile('srs/連続.md');
                mockApp.metadataCache.getFileCache.mockReturnValue({
                    frontmatter: { repeat: currentRepeat, next_due: '2026-06-30' },
                });
                const routineNote = engine.readRoutineNote(mockFile)!;

                const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
                await engine.processCompletion(routineNote, new Date('2026-06-30'));

                const args = updateSpy.mock.calls[0][1];
                expect(Number.isInteger(args.repeat)).toBe(true);
                expect(args.repeat).toBeGreaterThanOrEqual(currentRepeat * 2);
                expect(args.repeat).toBeLessThanOrEqual(currentRepeat * 3);

                currentRepeat = args.repeat as number;
                updateSpy.mockRestore();
            }

            expect(currentRepeat).toBeGreaterThanOrEqual(16);
        });

        it('next_due should equal today + current repeat (not grown repeat)', async () => {
            const mockFile = makeFile('srs/日付確認.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 5, next_due: '2026-06-30' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            // next_due = today + current repeat (5), not grown repeat
            expect(args.nextDue).toBe('2026-07-05');
            // repeat grows for next time: 5 * 2~3 = 10~15
            expect(args.repeat).toBeGreaterThanOrEqual(10);
            expect(args.repeat).toBeLessThanOrEqual(15);
        });
    });

    describe('routine/ notes are not affected by SRS growth', () => {
        it('should NOT grow repeat for routine/ folder notes', async () => {
            const mockFile = makeFile('routine/毎日の運動.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 1, next_due: '2026-06-30' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            // routine note: repeat is either unchanged (1) or not passed at all — never grown
            expect(args.repeat === undefined || args.repeat === 1).toBe(true);
            expect(args.nextDue).toBe('2026-07-01');
        });
    });

    describe('SRS with no explicit repeat', () => {
        it('should default to repeat: 1, set next_due to tomorrow, and grow repeat', async () => {
            const mockFile = makeFile('srs/最小.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { next_due: '2026-06-30' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;
            expect(routineNote.repeatExplicit).toBe(false);

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            // next_due uses default repeat 1: tomorrow
            expect(args.nextDue).toBe('2026-07-01');
            // repeat grows from 1
            expect(args.repeat).toBeGreaterThanOrEqual(2);
            expect(args.repeat).toBeLessThanOrEqual(3);
        });
    });

    describe('SRS edge cases', () => {
        it('should handle large repeat values', async () => {
            const mockFile = makeFile('srs/長期.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 30, next_due: '2026-06-30' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            expect(args.repeat).toBeGreaterThanOrEqual(60);
            expect(args.repeat).toBeLessThanOrEqual(90);
            expect(Number.isInteger(args.repeat)).toBe(true);
        });

        it('should handle string repeat (e.g. "5") in srs/ folder', async () => {
            const mockFile = makeFile('srs/文字列リピート.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: '5', next_due: '2026-06-30' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            expect(args.repeat).toBeGreaterThanOrEqual(10);
            expect(args.repeat).toBeLessThanOrEqual(15);
            expect(Number.isInteger(args.repeat)).toBe(true);
        });

        it('should treat repeat: 0 as 1 for both next_due and growth', async () => {
            const mockFile = makeFile('srs/ゼロ.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 0, next_due: '2026-06-30' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            // next_due: treat 0 as 1 -> tomorrow
            expect(args.nextDue).toBe('2026-07-01');
            // repeat: grow from 1 -> 2~3
            expect(args.repeat).toBeGreaterThanOrEqual(2);
            expect(args.repeat).toBeLessThanOrEqual(3);
        });

        it('should use current repeat for next_due and grow, even when next_due is in the future', async () => {
            const mockFile = makeFile('srs/未来日.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 4, next_due: '2026-07-05' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            // next_due = today + current repeat (4) = 2026-07-04
            expect(args.nextDue).toBe('2026-07-04');
            // repeat grows: 4 * 2~3 = 8~12
            expect(args.repeat).toBeGreaterThanOrEqual(8);
            expect(args.repeat).toBeLessThanOrEqual(12);
            expect(Number.isInteger(args.repeat)).toBe(true);
        });
    });

    describe('SRS preserves existing YAML fields', () => {
        it('should not overwrite start, estimate, section, or other fields on completion', async () => {
            const mockFile = makeFile('srs/フル装備.md');
            const originalFm = {
                repeat: 5,
                next_due: '2026-06-30',
                start: 900,
                estimate: 15,
                section: 1200,
                start_before: 2,
                summary_role: 'test',
            };
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { ...originalFm },
            });

            const routineNote = engine.readRoutineNote(mockFile)!;
            expect(routineNote.start).toBe(900);
            expect(routineNote.estimate).toBe(15);
            expect(routineNote.section).toBe(1200);
            expect(routineNote.start_before).toBe(2);

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            // updateNextDue should only set nextDue and repeat, not touch other fields
            expect(Object.keys(args)).toEqual(expect.arrayContaining(['nextDue', 'repeat']));
            const keys = Object.keys(args);
            expect(keys).not.toContain('start');
            expect(keys).not.toContain('estimate');
            expect(keys).not.toContain('section');
            expect(keys).not.toContain('start_before');
            expect(keys).not.toContain('summary_role');
        });
    });
});
