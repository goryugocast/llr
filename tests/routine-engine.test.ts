import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveDeferredDateByCutoff, RoutineEngine } from '../src/service/routine-engine';
import { TFile } from 'obsidian';

const DEFAULT_ROUTINE_FOLDER = 'routine';

// Mock Obsidian modules
vi.mock('obsidian', () => ({
    TFile: class { },
    App: class { },
    Notice: class { },
}));

describe('RoutineEngine', () => {
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
            }
        };
        engine = new RoutineEngine(mockApp as any);
    });

    describe('resolveDeferredDateByCutoff', () => {
        it('uses the same day before the cutoff time', () => {
            const resolved = resolveDeferredDateByCutoff(new Date('2026-03-01T02:59:00'), '0300');
            expect(toDateString(resolved)).toBe('2026-03-01');
        });

        it('uses the next day at or after the cutoff time', () => {
            const resolved = resolveDeferredDateByCutoff(new Date('2026-03-01T03:00:00'), '0300');
            expect(toDateString(resolved)).toBe('2026-03-02');
        });

        it('falls back to 03:00 when the cutoff is malformed', () => {
            const resolved = resolveDeferredDateByCutoff(new Date('2026-03-01T02:30:00'), 'bad');
            expect(toDateString(resolved)).toBe('2026-03-01');
        });
    });

    describe('extractLinkTexts', () => {
        it('should extract multiple links from a line', () => {
            const line = '- [x] [[Routine A]] and [[Routine B|Alias]]';
            const links = engine.extractLinkTexts(line);
            expect(links).toEqual(['Routine A', 'Routine B']);
        });

        it('should return empty array if no links', () => {
            const line = '- [x] Clean the room';
            const links = engine.extractLinkTexts(line);
            expect(links).toEqual([]);
        });
    });

    describe('resolveRoutineFile', () => {
        it('should resolve a file in the root of the routine/ folder', () => {
            const mockFile = { path: `${DEFAULT_ROUTINE_FOLDER}/daily.md` } as TFile;
            mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);

            const resolved = engine.resolveRoutineFile('daily', 'source.md');
            expect(resolved).toBe(mockFile);
        });

        it('should NOT resolve a file in a subfolder of routine/', () => {
            const mockFile = { path: `${DEFAULT_ROUTINE_FOLDER}/sub/daily.md` } as TFile;
            mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);

            const resolved = engine.resolveRoutineFile('daily', 'source.md');
            expect(resolved).toBeNull();
        });

        it('should NOT resolve a file outside routine/', () => {
            const mockFile = { path: 'notes/daily.md' } as TFile;
            mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);

            const resolved = engine.resolveRoutineFile('daily', 'source.md');
            expect(resolved).toBeNull();
        });

        it('should resolve files from a configured custom routine folder', () => {
            const customEngine = new RoutineEngine(mockApp as any, { routineFolder: 'routines/repeat' });
            const mockFile = { path: 'routines/repeat/morning.md' } as TFile;
            mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);

            const resolved = customEngine.resolveRoutineFile('morning', 'source.md');
            expect(resolved).toBe(mockFile);
        });
    });

    describe('processCompletion Fallback', () => {
        it('should update next_due to tomorrow if regular calculation fails', async () => {
            const mockFile = { path: 'routine/error.md' } as TFile;
            const routineNote = {
                file: mockFile,
                frequency: { type: 'schedule', expression: 'every crazy day' } as any,
                next_due: '2026-02-22'
            };

            // Mock updateNextDue instead of internal calculateNextDue to verify the effect
            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();

            await engine.processCompletion(routineNote as any, new Date('2026-02-22'));

            // calculateNextDue("every crazy day") will throw, triggering fallback
            expect(updateSpy).toHaveBeenCalled();
            const calledArg = updateSpy.mock.calls[0][1];

            // Should be tomorrow's date
            expect(calledArg).toEqual({ nextDue: '2026-02-23' });
        });

        it('should update next_due to tomorrow if frequency is missing', async () => {
            const mockFile = { path: 'routine/no-freq.md' } as TFile;
            const routineNote = { file: mockFile, frequency: undefined };

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote as any, new Date('2026-02-22'));

            expect(updateSpy).toHaveBeenCalled();
            const calledArg = updateSpy.mock.calls[0][1];
            expect(calledArg).toEqual({ nextDue: '2026-02-23', repeat: 1 });
        });

        it('readRoutineNote should handle missing frontmatter', async () => {
            const mockFile = { path: 'routine/no-yaml.md' } as TFile;
            mockApp.metadataCache.getFileCache.mockReturnValue({}); // No frontmatter

            const note = await engine.readRoutineNote(mockFile);
            expect(note).not.toBeNull();
            expect(note?.frequency).toBeUndefined();
        });

        it('readRoutineNote should handle malformed frontmatter (e.g. leading space)', async () => {
            // Obsidian's metadataCache usually returns null/empty for malformed YAML
            const mockFile = { path: 'routine/malformed.md' } as TFile;
            mockApp.metadataCache.getFileCache.mockReturnValue({ frontmatter: undefined });

            const note = await engine.readRoutineNote(mockFile);
            expect(note).not.toBeNull();
            expect(note?.frequency).toBeUndefined();
        });

        it('readRoutineNote should parse start_before from supported formats', async () => {
            const mockFile = { path: 'routine/start-before.md' } as TFile;

            mockApp.metadataCache.getFileCache.mockReturnValueOnce({
                frontmatter: { repeat: '毎週月曜', start_before: 3 },
            });
            const numeric = await engine.readRoutineNote(mockFile);
            expect(numeric?.start_before).toBe(3);

            mockApp.metadataCache.getFileCache.mockReturnValueOnce({
                frontmatter: { repeat: '毎週月曜', start_before: '5' },
            });
            const plainString = await engine.readRoutineNote(mockFile);
            expect(plainString?.start_before).toBe(5);

            mockApp.metadataCache.getFileCache.mockReturnValueOnce({
                frontmatter: { repeat: '毎週月曜', start_before: '5 days' },
            });
            const english = await engine.readRoutineNote(mockFile);
            expect(english?.start_before).toBe(5);

            mockApp.metadataCache.getFileCache.mockReturnValueOnce({
                frontmatter: { repeat: '毎週月曜', start_before: '７日' },
            });
            const japanese = await engine.readRoutineNote(mockFile);
            expect(japanese?.start_before).toBe(7);
        });

        it('should update next_due to tomorrow if frontmatter is unparseable during processCompletion', async () => {
            const mockFile = { path: 'routine/unparseable.md' } as TFile;
            // Simulate a scenario where readRoutineNote would return a note with undefined frequency
            // due to unparseable frontmatter (e.g., malformed YAML)
            mockApp.metadataCache.getFileCache.mockImplementation((file: TFile) => {
                if (file.path === 'routine/unparseable.md') {
                    return { frontmatter: undefined }; // Simulate unparseable YAML
                }
                return {};
            });

            const routineNote = {
                file: mockFile,
                // frequency will be undefined after readRoutineNote is called internally
                next_due: '2026-02-22'
            } as any;

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();

            // with undefined frequency due to the mocked getFileCache.
            await engine.processCompletion(routineNote as any, new Date('2026-02-22'));
            const calledArg = updateSpy.mock.calls[0][1];

            // Should be the day after the completion date (completion-day based)
            expect(calledArg).toEqual({ nextDue: '2026-02-23', repeat: 1 });
        });

        it('should preserve existing metadata like estimate and section', async () => {
            const mockFile = { path: 'routine/metadata.md' } as TFile;
            const routineNote = {
                file: mockFile,
                frequency: { type: 'daily', interval: 1 } as any,
                estimate: 30,
                section: 10,
                next_due: '2026-02-22'
            };

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote as any, new Date('2026-02-22'));

            expect(updateSpy).toHaveBeenCalledWith(mockFile, { nextDue: '2026-02-23', repeat: undefined });
            // updateNextDue is responsible for Safe YAML update, here we just verify the call.
        });

        it('should recalculate from completion day even when next_due is already in the future', async () => {
            const mockFile = { path: 'routine/future.md' } as TFile;
            const routineNote = {
                file: mockFile,
                frequency: { type: 'daily', interval: 1 } as any,
                next_due: '2026-12-31'
            };

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote as any, new Date('2026-02-22'));

            expect(updateSpy).toHaveBeenCalledWith(mockFile, { nextDue: '2026-02-23', repeat: undefined });
        });

        it('should keep future next_due for schedules explicitly anchored to due', async () => {
            const mockFile = { path: 'routine/due-anchor-future.md' } as TFile;
            const routineNote = {
                file: mockFile,
                frequency: { type: 'schedule', expression: 'every 5 days from due' } as any,
                next_due: '2026-03-01'
            };

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote as any, new Date('2026-02-22'));

            expect(updateSpy).toHaveBeenCalledWith(mockFile, { nextDue: '2026-03-01', repeat: undefined });
        });

        it('should catch up due-anchored schedules to the nearest future date', async () => {
            const mockFile = { path: 'routine/due-anchor-catchup.md' } as TFile;
            const routineNote = {
                file: mockFile,
                frequency: { type: 'schedule', expression: 'every 5 days from due' } as any,
                next_due: '2026-02-21'
            };

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote as any, new Date('2026-02-26'));

            // phase: 2/21 -> 2/26 -> 3/03 ; must be strictly after today
            expect(updateSpy).toHaveBeenCalledWith(mockFile, { nextDue: '2026-03-03', repeat: undefined });
        });

        it('advances from current next_due when @done mode is requested within the start_before window', async () => {
            const mockFile = { path: 'routine/start-before-done.md' } as TFile;
            const routineNote = {
                file: mockFile,
                frequency: { type: 'schedule', expression: 'every week on thu' } as any,
                next_due: '2026-04-09',
                start_before: 2,
            };

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(
                routineNote as any,
                new Date('2026-04-08T09:00:00'),
                { mode: 'advanceFromDue' }
            );

            expect(updateSpy).toHaveBeenCalledWith(mockFile, { nextDue: '2026-04-16', repeat: undefined });
        });

        it('ignores @done mode outside the start_before window and falls back to normal completion logic', async () => {
            const mockFile = { path: 'routine/start-before-done-outside.md' } as TFile;
            const routineNote = {
                file: mockFile,
                frequency: { type: 'schedule', expression: 'every week on thu' } as any,
                next_due: '2026-04-09',
                start_before: 2,
            };

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(
                routineNote as any,
                new Date('2026-04-05T09:00:00'),
                { mode: 'advanceFromDue' }
            );

            expect(updateSpy).toHaveBeenCalledWith(mockFile, { nextDue: '2026-04-09', repeat: undefined });
        });
    });

    describe('Advanced Link & File Resolution', () => {
        it('should deduplicate links in scheduleUpdate', () => {
            // This is harder to test without mocking timers, but we check the deduplication logic in unit
            const rawLinks = engine.extractLinkTexts('[[A]] and [[A]]');
            const uniqueLinks = [...new Set(rawLinks)];
            expect(uniqueLinks).toHaveLength(1);
            expect(uniqueLinks[0]).toBe('A');
        });

        it('should handle case-insensitive folder checks', () => {
            const mockFile = { path: 'ROUTINE/Routine.md' } as TFile;
            mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);

            const resolved = engine.resolveRoutineFile('Routine', 'source.md');
            expect(resolved).not.toBeNull();
            expect(resolved?.path).toBe('ROUTINE/Routine.md');
        });

        it('should handle files with spaces and special characters', () => {
            const mockFile = { path: `${DEFAULT_ROUTINE_FOLDER}/Test & Space.md` } as TFile;
            mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);

            const resolved = engine.resolveRoutineFile('Test & Space', 'source.md');
            expect(resolved).not.toBeNull();
            expect(resolved?.path).toBe(`${DEFAULT_ROUTINE_FOLDER}/Test & Space.md`);
        });

        it('should properly cancel update when completionDate is null', () => {
            vi.useFakeTimers();
            const mockFile = { path: 'routine/cancel.md', basename: 'cancel' } as unknown as TFile;
            mockApp.metadataCache.getFirstLinkpathDest.mockReturnValue(mockFile);

            // 1. Schedule update
            engine.scheduleUpdate(mockFile, 'src.md', {
                completionDate: new Date('2026-02-22T09:00:00'),
            });
            expect(vi.getTimerCount()).toBe(1);

            // 2. Cancel update (task unchecked)
            engine.scheduleUpdate(mockFile, 'src.md', null);
            expect(vi.getTimerCount()).toBe(0);

            vi.useRealTimers();
        });

        it('should remove next_due when schedule is none', async () => {
            const mockFile = { path: 'routine/none.md' } as any;
            const routineNote = {
                file: mockFile,
                frequency: { type: 'none' },
                next_due: '2026-02-22'
            };

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote as any, new Date('2026-02-22'));

            expect(updateSpy).toHaveBeenCalledWith(mockFile, { nextDue: null, repeat: undefined });
        });

        it('should remove stale next_due when repeat is 0', async () => {
            const mockFile = { path: 'routine/repeat-zero.md' } as TFile;
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    repeat: 0,
                    next_due: '2026-02-22',
                },
            });

            const routineNote = await engine.readRoutineNote(mockFile);
            expect(routineNote?.frequency).toEqual({ type: 'none' });
            expect(routineNote?.next_due).toBe('2026-02-22');

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote as any, new Date('2026-02-22'));

            expect(updateSpy).toHaveBeenCalledWith(mockFile, { nextDue: null, repeat: undefined });
        });

        it('should append repeat: 1 when frequency is missing', async () => {
            const mockFile = { path: 'routine/new.md' } as any;
            const routineNote = { file: mockFile, frequency: undefined };

            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();
            await engine.processCompletion(routineNote as any, new Date('2026-02-22'));

            expect(updateSpy).toHaveBeenCalledWith(mockFile, {
                nextDue: '2026-02-23',
                repeat: 1
            });
        });
    });

    describe('fetchDueRoutines rollover', () => {
        it('reads due routines from the configured custom routine folder', async () => {
            const customEngine = new RoutineEngine(mockApp as any, { routineFolder: 'routines/repeat' });
            const routineFile = makeFile('routines/repeat/today.md');
            mockApp.vault.getFolderByPath.mockReturnValue({ children: [routineFile] });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    repeat: 'every day',
                    next_due: '2026-02-27',
                },
            });

            const results = await customEngine.fetchDueRoutines(new Date('2026-02-27T12:00:00'));
            expect(mockApp.vault.getFolderByPath).toHaveBeenCalledWith('routines/repeat');
            expect(results).toHaveLength(1);
            expect(results[0].file.path).toBe('routines/repeat/today.md');
        });

        it('catches up overdue completion-anchored routines for preview only and shows them only when due today', async () => {
            const routineFile = makeFile('routine/sticky.md');
            mockApp.vault.getFolderByPath.mockReturnValue({ children: [routineFile] });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    repeat: 'every 3 days from completion',
                    next_due: '2026-02-25',
                },
            });
            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();

            const results = await engine.fetchDueRoutines(new Date('2026-02-27T12:00:00'));
            expect(updateSpy).not.toHaveBeenCalled();
            expect(results).toHaveLength(0);
        });

        it('shows overdue completion-anchored routines after preview catch-up when the normalized due date is today', async () => {
            const routineFile = makeFile('routine/sticky-today.md');
            mockApp.vault.getFolderByPath.mockReturnValue({ children: [routineFile] });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    repeat: 'every 3 days from completion',
                    next_due: '2026-02-25',
                },
            });
            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();

            const results = await engine.fetchDueRoutines(new Date('2026-02-28T12:00:00'));
            expect(updateSpy).not.toHaveBeenCalled();
            expect(results).toHaveLength(1);
            expect(results[0].file.path).toBe('routine/sticky-today.md');
            expect(results[0].next_due).toBe('2026-02-28');
        });

        it('treats repeat none as sticky when next_due remains in the past', async () => {
            const routineFile = makeFile('routine/none-sticky.md');
            mockApp.vault.getFolderByPath.mockReturnValue({ children: [routineFile] });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    repeat: 0,
                    next_due: '2026-02-26',
                },
            });

            const results = await engine.fetchDueRoutines(new Date('2026-02-27T12:00:00'));
            expect(results).toHaveLength(1);
            expect(results[0].file.path).toBe('routine/none-sticky.md');
        });

        it('does not show repeat none when next_due has already been cleared', async () => {
            const routineFile = makeFile('routine/none-cleared.md');
            mockApp.vault.getFolderByPath.mockReturnValue({ children: [routineFile] });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    repeat: 0,
                },
            });

            const results = await engine.fetchDueRoutines(new Date('2026-02-27T12:00:00'));
            expect(results).toHaveLength(0);
        });

        it('catches up overdue due-anchored routines for preview and only shows them on the next valid day', async () => {
            const routineFile = makeFile('routine/catchup.md');
            mockApp.vault.getFolderByPath.mockReturnValue({ children: [routineFile] });
            const frontmatter = {
                repeat: 'every 5 days from due',
                next_due: '2026-02-21',
            };
            mockApp.metadataCache.getFileCache.mockImplementation(() => ({ frontmatter }));
            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockImplementation(async (_file, options) => {
                frontmatter.next_due = options.nextDue as string;
            });

            const notYet = await engine.fetchDueRoutines(new Date('2026-02-27T12:00:00'));
            expect(updateSpy).not.toHaveBeenCalled();
            expect(notYet).toHaveLength(0);
            expect(frontmatter.next_due).toBe('2026-02-21');

            updateSpy.mockClear();
            const onNextValidDay = await engine.fetchDueRoutines(new Date('2026-03-03T12:00:00'));
            expect(onNextValidDay).toHaveLength(1);
            expect(onNextValidDay[0].file.path).toBe('routine/catchup.md');
            expect(updateSpy).not.toHaveBeenCalled();
            expect(onNextValidDay[0].next_due).toBe('2026-03-03');
        });

        it('keeps overdue routines visible when rollover is explicitly enabled', async () => {
            const routineFile = makeFile('routine/forced-sticky.md');
            mockApp.vault.getFolderByPath.mockReturnValue({ children: [routineFile] });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    repeat: 'every week on thu',
                    next_due: '2026-02-26',
                    rollover: true,
                },
            });
            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();

            const results = await engine.fetchDueRoutines(new Date('2026-02-27T12:00:00'));
            expect(updateSpy).not.toHaveBeenCalled();
            expect(results).toHaveLength(1);
            expect(results[0].file.path).toBe('routine/forced-sticky.md');
        });

        it('does not include repeating routines with no next_due', async () => {
            const routineFile = makeFile('routine/no-next-due.md');
            mockApp.vault.getFolderByPath.mockReturnValue({ children: [routineFile] });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    repeat: 'every 5 days',
                },
            });

            const results = await engine.fetchDueRoutines(new Date('2026-02-27T12:00:00'));
            expect(results).toHaveLength(0);
        });

        it('includes a one-off routine note when next_due is today even without repeat', async () => {
            const routineFile = makeFile('routine/one-off-today.md');
            mockApp.vault.getFolderByPath.mockReturnValue({ children: [routineFile] });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    next_due: '2026-02-27',
                },
            });

            const results = await engine.fetchDueRoutines(new Date('2026-02-27T12:00:00'));
            expect(results).toHaveLength(1);
            expect(results[0].file.path).toBe('routine/one-off-today.md');
            expect(results[0].next_due).toBe('2026-02-27');
            expect(results[0].frequency).toBeUndefined();
        });

        it('shows a one-off routine note during the lead window defined by start_before', async () => {
            const routineFile = makeFile('routine/one-off-lead-window.md');
            mockApp.vault.getFolderByPath.mockReturnValue({ children: [routineFile] });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    next_due: '2026-03-03',
                    start_before: 1,
                },
            });

            const results = await engine.fetchDueRoutines(new Date('2026-03-02T12:00:00'));
            expect(results).toHaveLength(1);
            expect(results[0].file.path).toBe('routine/one-off-lead-window.md');
        });

        it('does not keep overdue one-off routine notes visible after next_due passes', async () => {
            const routineFile = makeFile('routine/one-off-overdue.md');
            mockApp.vault.getFolderByPath.mockReturnValue({ children: [routineFile] });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    next_due: '2026-02-26',
                },
            });

            const results = await engine.fetchDueRoutines(new Date('2026-02-27T12:00:00'));
            expect(results).toHaveLength(0);
        });

        it('shows a routine during the lead window defined by start_before', async () => {
            const routineFile = makeFile('routine/lead-window.md');
            mockApp.vault.getFolderByPath.mockReturnValue({ children: [routineFile] });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    repeat: 'every week on tue',
                    next_due: '2026-03-03',
                    start_before: '1 day',
                },
            });

            const results = await engine.fetchDueRoutines(new Date('2026-03-02T12:00:00'));
            expect(results).toHaveLength(1);
            expect(results[0].file.path).toBe('routine/lead-window.md');
            expect(results[0].start_before).toBe(1);
        });

        it('does not show a routine before the lead window starts', async () => {
            const routineFile = makeFile('routine/lead-window-late.md');
            mockApp.vault.getFolderByPath.mockReturnValue({ children: [routineFile] });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    repeat: 'every week on tue',
                    next_due: '2026-03-03',
                    start_before: '1 day',
                },
            });

            const results = await engine.fetchDueRoutines(new Date('2026-03-01T12:00:00'));
            expect(results).toHaveLength(0);
        });

        it('keeps overdue start_before routines visible when rollover is enabled', async () => {
            const routineFile = makeFile('routine/lead-window-overdue.md');
            mockApp.vault.getFolderByPath.mockReturnValue({ children: [routineFile] });
            mockApp.metadataCache.getFileCache.mockReturnValue({
                frontmatter: {
                    repeat: '第1土曜日',
                    next_due: '2026-03-07',
                    start_before: 6,
                    rollover: true,
                },
            });
            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValue();

            const results = await engine.fetchDueRoutines(new Date('2026-03-08T12:00:00'));
            expect(updateSpy).not.toHaveBeenCalled();
            expect(results).toHaveLength(1);
            expect(results[0].file.path).toBe('routine/lead-window-overdue.md');
        });
    });
});

function toDateString(date: Date): string {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}
