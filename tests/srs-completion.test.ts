import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoutineEngine } from '../src/service/routine-engine';
import { TFile } from 'obsidian';

vi.mock('obsidian', () => ({
    TFile: class { },
    App: class { },
    Notice: class { },
}));

describe('SRS completion (vault-wide)', () => {
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
                getMarkdownFiles: vi.fn().mockReturnValue([]),
                read: vi.fn(),
            },
        };
        engine = new RoutineEngine(mockApp as any);
    });

    describe('SRS recognition (vault-wide, not folder-based)', () => {
        it('isSrsFile should recognize a file with repeat > 0 outside routine/', () => {
            const file = makeFile('notes/Book/振り返りノート.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 5, next_due: '2026-06-30' },
            });
            expect(engine.isSrsFile(file)).toBe(true);
        });

        it('isSrsFile should reject a file inside routine/ even with repeat > 0', () => {
            const file = makeFile('routine/毎日の運動.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 1, next_due: '2026-06-30' },
            });
            expect(engine.isSrsFile(file)).toBe(false);
        });

        it('isSrsFile should reject a file with no repeat', () => {
            const file = makeFile('notes/ただのメモ.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { next_due: '2026-06-30' },
            });
            expect(engine.isSrsFile(file)).toBe(false);
        });

        it('isSrsFile should reject a file with repeat: 0', () => {
            const file = makeFile('notes/止めたノート.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 0, next_due: '2026-06-30' },
            });
            expect(engine.isSrsFile(file)).toBe(false);
        });

        it('isSrsFile should accept string repeat "5"', () => {
            const file = makeFile('notes/文字列リピート.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: '5', next_due: '2026-06-30' },
            });
            expect(engine.isSrsFile(file)).toBe(true);
        });

        it('resolveRoutineFile should resolve a file with repeat outside routine/', () => {
            const mockFile = makeFile('notes/Book/振り返りノート.md');
            mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 3, next_due: '2026-06-30' },
            });

            const resolved = engine.resolveRoutineFile('振り返りノート', 'daily/2026-06-30.md');
            expect(resolved).toBe(mockFile);
        });

        it('resolveRoutineFile should still resolve routine/ files', () => {
            const mockFile = makeFile('routine/朝のルーチン.md');
            mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 1, next_due: '2026-06-30' },
            });

            const resolved = engine.resolveRoutineFile('朝のルーチン', 'daily/2026-06-30.md');
            expect(resolved).toBe(mockFile);
        });

        it('resolveRoutineFile should reject files without repeat outside routine/', () => {
            const mockFile = makeFile('notes/ただのメモ.md');
            mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {},
            });

            const resolved = engine.resolveRoutineFile('ただのメモ', 'daily/2026-06-30.md');
            expect(resolved).toBeNull();
        });

        it('isSrsFile should work with srs/ folder too (backwards compatible)', () => {
            const file = makeFile('srs/復習ノート.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 3, next_due: '2026-06-30' },
            });
            expect(engine.isSrsFile(file)).toBe(true);
        });

        it('isSrsFile should work with deeply nested files', () => {
            const file = makeFile('notes/Book/Novel/『7』.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 1, next_due: '2026-05-09' },
            });
            expect(engine.isSrsFile(file)).toBe(true);
        });
    });

    describe('fetchDueRoutines scans vault-wide', () => {
        it('should pick up SRS notes from anywhere in the vault', () => {
            const routineFile = makeFile('routine/毎日の運動.md');
            const bookFile = makeFile('notes/Book/『7』.md');

            mockApp.vault.getFolderByPath.mockImplementation((path: string) => {
                if (path === 'routine') return { children: [routineFile] };
                return null;
            });
            mockApp.vault.getMarkdownFiles.mockReturnValue([routineFile, bookFile]);
            mockApp.metadataCache.getFileCache.mockImplementation((file: TFile) => {
                if ((file as any).path === 'routine/毎日の運動.md') {
                    return { frontmatter: { repeat: 1, next_due: '2026-06-30' } };
                }
                if ((file as any).path === 'notes/Book/『7』.md') {
                    return { frontmatter: { repeat: 5, next_due: '2026-06-30' } };
                }
                return null;
            });

            const today = new Date('2026-06-30T10:00:00');
            const results = engine.fetchDueRoutines(today);

            expect(results).toHaveLength(2);
            expect(results.some(r => r.file.path === 'routine/毎日の運動.md')).toBe(true);
            expect(results.some(r => r.file.path === 'notes/Book/『7』.md')).toBe(true);
        });

        it('should not pick up files without repeat', () => {
            const plainFile = makeFile('notes/ただのメモ.md');

            mockApp.vault.getFolderByPath.mockReturnValue(null);
            mockApp.vault.getMarkdownFiles.mockReturnValue([plainFile]);
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { next_due: '2026-06-30' },
            });

            const today = new Date('2026-06-30T10:00:00');
            const results = engine.fetchDueRoutines(today);
            expect(results).toHaveLength(0);
        });

        it('should not duplicate routine/ files already collected', () => {
            const routineFile = makeFile('routine/毎日の運動.md');

            mockApp.vault.getFolderByPath.mockImplementation((path: string) => {
                if (path === 'routine') return { children: [routineFile] };
                return null;
            });
            mockApp.vault.getMarkdownFiles.mockReturnValue([routineFile]);
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 1, next_due: '2026-06-30' },
            });

            const today = new Date('2026-06-30T10:00:00');
            const results = engine.fetchDueRoutines(today);
            expect(results).toHaveLength(1);
        });
    });

    describe('SRS completion grows interval', () => {
        it('should use current repeat for next_due, then grow repeat for next time', async () => {
            const mockFile = makeFile('notes/Book/テスト.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 3, next_due: '2026-06-30' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            expect(args.nextDue).toBe('2026-07-03');
            expect(typeof args.repeat).toBe('number');
            expect(Number.isInteger(args.repeat)).toBe(true);
            expect(args.repeat).toBeGreaterThanOrEqual(6);
            expect(args.repeat).toBeLessThanOrEqual(9);
        });

        it('should grow repeat: 1 to 2 or 3, with next_due 1 day later', async () => {
            const mockFile = makeFile('notes/Book/初回.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 1, next_due: '2026-06-30' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            expect(args.nextDue).toBe('2026-07-01');
            expect(args.repeat).toBeGreaterThanOrEqual(2);
            expect(args.repeat).toBeLessThanOrEqual(3);
        });

        it('should always produce integer repeat even after multiple growth cycles', async () => {
            let currentRepeat = 1;

            for (let i = 0; i < 4; i++) {
                const mockFile = makeFile('notes/連続.md');
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
            const mockFile = makeFile('notes/日付確認.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 5, next_due: '2026-06-30' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            expect(args.nextDue).toBe('2026-07-05');
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
            expect(args.repeat === undefined || args.repeat === 1).toBe(true);
            expect(args.nextDue).toBe('2026-07-01');
        });
    });

    describe('SRS with no explicit repeat', () => {
        it('file without repeat is not SRS', () => {
            const file = makeFile('notes/最小.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { next_due: '2026-06-30' },
            });
            expect(engine.isSrsFile(file)).toBe(false);
        });
    });

    describe('SRS edge cases', () => {
        it('should handle large repeat values', async () => {
            const mockFile = makeFile('notes/長期.md');
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

        it('should handle string repeat (e.g. "5")', async () => {
            const mockFile = makeFile('notes/文字列リピート.md');
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

        it('repeat: 0 means SRS is disabled (isSrsFile returns false)', () => {
            const file = makeFile('notes/ゼロ.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 0, next_due: '2026-06-30' },
            });
            expect(engine.isSrsFile(file)).toBe(false);
        });

        it('should use current repeat for next_due even when next_due is in the future', async () => {
            const mockFile = makeFile('notes/未来日.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 4, next_due: '2026-07-05' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            expect(args.nextDue).toBe('2026-07-04');
            expect(args.repeat).toBeGreaterThanOrEqual(8);
            expect(args.repeat).toBeLessThanOrEqual(12);
            expect(Number.isInteger(args.repeat)).toBe(true);
        });

        it('custom routineFolder is respected (not hardcoded)', () => {
            const customEngine = new RoutineEngine(mockApp as any, { routineFolder: 'my-routines' });
            const file = makeFile('my-routines/タスク.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 5, next_due: '2026-06-30' },
            });
            expect(customEngine.isSrsFile(file)).toBe(false);

            const outsideFile = makeFile('notes/振り返り.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 5, next_due: '2026-06-30' },
            });
            expect(customEngine.isSrsFile(outsideFile)).toBe(true);
        });
    });

    describe('SRS preserves existing YAML fields', () => {
        it('should not overwrite start, estimate, section, or other fields on completion', async () => {
            const mockFile = makeFile('notes/Book/フル装備.md');
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
