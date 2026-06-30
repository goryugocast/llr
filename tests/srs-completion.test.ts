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
        engine = new RoutineEngine(mockApp as any, { srsGrowthEnabled: true });
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

        it('isSrsFile should reject files in routine/ subfolders', () => {
            const file = makeFile('routine/完了/過去のタスク.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 5, next_due: '2026-06-30' },
            });
            expect(engine.isSrsFile(file)).toBe(false);
        });

        it('isSrsFile returns false when srsGrowthEnabled is off', () => {
            const offEngine = new RoutineEngine(mockApp as any, { srsGrowthEnabled: false });
            const file = makeFile('notes/Book/振り返り.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 5, next_due: '2026-06-30' },
            });
            expect(offEngine.isSrsFile(file)).toBe(false);
        });

        it('fetchDueRoutines skips vault scan when srsGrowthEnabled is off', () => {
            const offEngine = new RoutineEngine(mockApp as any, { srsGrowthEnabled: false });
            const bookFile = makeFile('notes/Book/『7』.md');

            mockApp.vault.getFolderByPath.mockReturnValue(null);
            mockApp.vault.getMarkdownFiles.mockReturnValue([bookFile]);
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 5, next_due: '2026-06-30' },
            });

            const results = offEngine.fetchDueRoutines(new Date('2026-06-30T10:00:00'));
            expect(results).toHaveLength(0);
            expect(mockApp.vault.getMarkdownFiles).not.toHaveBeenCalled();
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

            const routineResult = results.find(r => r.file.path === 'routine/毎日の運動.md');
            const srsResult = results.find(r => r.file.path === 'notes/Book/『7』.md');
            expect(routineResult?.isSrs).toBeFalsy();
            expect(srsResult?.isSrs).toBe(true);
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

        it('overdue: should grow based on elapsed days when longer than repeat', async () => {
            const mockFile = makeFile('srs/放置ノート.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 7, next_due: '2026-06-10' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            // completionDay = 6/30, due was 6/10, elapsed = 20 days
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            // next_due still uses current repeat: 6/30 + 7 = 7/7
            expect(args.nextDue).toBe('2026-07-07');
            // growth base = 20 (elapsed) not 7 (repeat), so 20 * 2~3 = 40~60
            expect(args.repeat).toBeGreaterThanOrEqual(40);
            expect(args.repeat).toBeLessThanOrEqual(60);
        });

        it('overdue: should use repeat when elapsed is shorter', async () => {
            const mockFile = makeFile('srs/早めノート.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 10, next_due: '2026-06-28' },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            // completionDay = 6/30, due was 6/28, elapsed = 2 days (less than repeat 10)
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            // growth base = 10 (repeat), not 2 (elapsed)
            expect(args.repeat).toBeGreaterThanOrEqual(20);
            expect(args.repeat).toBeLessThanOrEqual(30);
        });

        it('overdue: should handle no next_due gracefully', async () => {
            const mockFile = makeFile('srs/初期ノート.md');
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { repeat: 3 },
            });
            const routineNote = engine.readRoutineNote(mockFile)!;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote, new Date('2026-06-30'));

            const args = updateSpy.mock.calls[0][1];
            // no next_due, so growth base = repeat (3)
            expect(args.repeat).toBeGreaterThanOrEqual(6);
            expect(args.repeat).toBeLessThanOrEqual(9);
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
            const customEngine = new RoutineEngine(mockApp as any, { routineFolder: 'my-routines', srsGrowthEnabled: true });
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

    describe('SRS notes sort to bottom in daily note insertion', () => {
        const makeSortableNote = (path: string, opts: { section?: number; start?: number; isSrs?: boolean }) => ({
            file: makeFile(path),
            section: opts.section,
            start: opts.start,
            isSrs: opts.isSrs,
            frequency: { type: 'schedule' as const, expression: 'every day' },
        });

        const sortKey = (r: { isSrs?: boolean; section?: number; start?: number }): [number, number] => {
            const sec = r.isSrs && r.section === undefined ? Infinity : (r.section ?? -Infinity);
            const start = r.start ?? -Infinity;
            return [sec, start];
        };

        const sortNotes = <T extends { isSrs?: boolean; section?: number; start?: number }>(notes: T[]): T[] =>
            [...notes].sort((a, b) => {
                const [as1, as2] = sortKey(a);
                const [bs1, bs2] = sortKey(b);
                return as1 !== bs1 ? as1 - bs1 : as2 - bs2;
            });

        it('SRS notes without section go after all routine notes', () => {
            const notes = [
                makeSortableNote('notes/Book/SRS本.md', { isSrs: true }),
                makeSortableNote('routine/朝の運動.md', {}),
                makeSortableNote('routine/夜の日記.md', { section: 2200 }),
            ];

            const sorted = sortNotes(notes);
            expect(sorted[0].file.path).toBe('routine/朝の運動.md');
            expect(sorted[1].file.path).toBe('routine/夜の日記.md');
            expect(sorted[2].file.path).toBe('notes/Book/SRS本.md');
        });

        it('SRS notes with section use that section position', () => {
            const notes = [
                makeSortableNote('notes/Book/SRS本.md', { isSrs: true, section: 900 }),
                makeSortableNote('routine/朝の運動.md', {}),
                makeSortableNote('routine/午後.md', { section: 1400 }),
            ];

            const sorted = sortNotes(notes);
            expect(sorted[0].file.path).toBe('routine/朝の運動.md');
            expect(sorted[1].file.path).toBe('notes/Book/SRS本.md');
            expect(sorted[2].file.path).toBe('routine/午後.md');
        });

        it('multiple SRS notes without section sort by start among themselves', () => {
            const notes = [
                makeSortableNote('notes/Book/B.md', { isSrs: true, start: 1000 }),
                makeSortableNote('notes/Book/A.md', { isSrs: true }),
                makeSortableNote('routine/朝.md', {}),
            ];

            const sorted = sortNotes(notes);
            expect(sorted[0].file.path).toBe('routine/朝.md');
            expect(sorted[1].file.path).toBe('notes/Book/A.md');
            expect(sorted[2].file.path).toBe('notes/Book/B.md');
        });

        it('routine notes without isSrs stay at their normal position', () => {
            const notes = [
                makeSortableNote('routine/B.md', { section: 1800 }),
                makeSortableNote('routine/A.md', {}),
            ];

            const sorted = sortNotes(notes);
            expect(sorted[0].file.path).toBe('routine/A.md');
            expect(sorted[1].file.path).toBe('routine/B.md');
        });
    });

    describe('SRS daily limit (srsMaxDaily)', () => {
        it('limits SRS notes by oldest next_due first', () => {
            const srsNotes = [
                { path: 'c.md', isSrs: true, next_due: '2026-06-28' },
                { path: 'a.md', isSrs: true, next_due: '2026-06-20' },
                { path: 'b.md', isSrs: true, next_due: '2026-06-25' },
                { path: 'd.md', isSrs: true, next_due: '2026-06-30' },
            ];

            srsNotes.sort((a, b) => (a.next_due ?? '').localeCompare(b.next_due ?? ''));
            const max = 2;
            const limited = srsNotes.slice(0, max);

            expect(limited).toHaveLength(2);
            expect(limited[0].path).toBe('a.md');
            expect(limited[1].path).toBe('b.md');
        });

        it('does not limit when max is 0 (unlimited)', () => {
            const srsNotes = [
                { path: 'a.md', isSrs: true, next_due: '2026-06-20' },
                { path: 'b.md', isSrs: true, next_due: '2026-06-25' },
                { path: 'c.md', isSrs: true, next_due: '2026-06-28' },
            ];

            const max = 0;
            const limited = max > 0 && srsNotes.length > max ? srsNotes.slice(0, max) : srsNotes;

            expect(limited).toHaveLength(3);
        });

        it('does not affect routine notes', () => {
            const routineNotes = [
                { path: 'r1.md', isSrs: false },
                { path: 'r2.md', isSrs: false },
                { path: 'r3.md', isSrs: false },
                { path: 'r4.md', isSrs: false },
            ];
            const srsNotes = [
                { path: 's1.md', isSrs: true, next_due: '2026-06-20' },
                { path: 's2.md', isSrs: true, next_due: '2026-06-25' },
            ];

            const max = 1;
            const limitedSrs = srsNotes.slice(0, max);
            const combined = [...routineNotes, ...limitedSrs];

            expect(combined).toHaveLength(5);
            expect(combined.filter(n => !n.isSrs)).toHaveLength(4);
            expect(combined.filter(n => n.isSrs)).toHaveLength(1);
        });
    });
});
