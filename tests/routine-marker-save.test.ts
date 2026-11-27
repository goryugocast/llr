import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';

vi.mock('obsidian', async (importOriginal) => ({
    ...await importOriginal<typeof import('obsidian')>(),
    MarkdownView: class {}, Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, AbstractInputSuggest: class {},
    normalizePath: (path: string) => path,
}));

import { TFile } from 'obsidian';
import LlrPlugin from '../src/main';
import { replacePendingRoutineAtDoneMarker } from '../src/service/routine-atdone-marker';
import { parseRoutineRescheduleMarker, replaceRoutineRescheduleMarker } from '../src/service/routine-reschedule-marker';

const beforeDate = new Date(2026, 0, 1);
const cases = [
    { marker: '@done', recorded: '→done', transform: replacePendingRoutineAtDoneMarker },
    { marker: '@0501', recorded: '→2026-05-01', transform: (line: string) => {
        const parsed = parseRoutineRescheduleMarker(line, beforeDate);
        return parsed ? replaceRoutineRescheduleMarker(line, parsed) : null;
    } },
];

function makeEditor(initial: string, tracked = true) {
    const source = Object.assign(new TFile(), { path: 'daily/test.md', extension: 'md' });
    const routine = Object.assign(new TFile(), { path: 'routine/Task.md' });
    const plugin = Object.assign(Object.create(LlrPlugin.prototype), {
        markerSaves: new Map(), completedMarkerSaves: new Set(),
        resolveSingleRoutineFileForLine: (text: string) => text.includes('[[Task]]') ? routine : null,
        debugLog: vi.fn(), showLlrNotice: vi.fn(),
    });
    const cm = { state: EditorState.create({ doc: initial }) };
    function edit(from: number, to: number, insert: string) {
        const transaction = cm.state.update({ changes: { from, to, insert } });
        const startState = cm.state;
        cm.state = transaction.state;
        plugin.trackRoutineMarkerEdits({ docChanged: true, changes: transaction.changes, view: cm, startState, state: cm.state });
    }
    const editor = {
        cm: tracked ? cm : null,
        getValue: () => cm.state.doc.toString(),
        getLine: (index: number) => cm.state.doc.line(index + 1).text,
        replaceRange: (text: string, from: { line: number; ch: number }, to: { line: number; ch: number }) =>
            edit(cm.state.doc.line(from.line + 1).from + from.ch, cm.state.doc.line(to.line + 1).from + to.ch, text),
    };
    const view = { file: source, editor };
    const context = { file: source, view, editor };
    return { edit, editor, view, plugin, source, routine, write: (line: number, entry: typeof cases[number], save: () => Promise<void | false>) =>
        plugin.saveRoutineMarker(context, line, routine, entry.marker, entry.transform, save) as Promise<boolean> };
}

describe.each(cases)('saving a routine marker $marker', entry => {
    const task = `- [ ] [[Task]] ${entry.marker}`;
    it('preserves an inserted task and edits only the original marker after a concurrent save', async () => {
        const { edit, editor, write } = makeEditor(task);
        let release!: () => void;
        const save = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
        const first = write(0, entry, save);
        const other = write(0, entry, save);
        edit(0, 0, 'another task\n');
        edit(editor.getValue().length, editor.getValue().length, ' note');
        release();
        await Promise.all([first, other]);
        expect(editor.getValue()).toBe(`another task\n- [ ] [[Task]] ${entry.recorded} note`);
        expect(save).toHaveBeenCalledTimes(1);
    });
    it('does not transfer the old acknowledgment to a replacement task with the same routine and marker', async () => {
        const { edit, editor, write } = makeEditor(task);
        const saving = write(0, entry, async () => {});
        edit(0, task.length, `- [ ] different task [[Task]] ${entry.marker}`);
        expect(await saving).toBe(false);
        expect(editor.getValue()).toContain(entry.marker);
    });
    it('tracks one of two identical lines through an insertion', async () => {
        const { edit, editor, write } = makeEditor(task + '\n' + task);
        const saving = write(1, entry, async () => {});
        edit(0, 0, 'another task\n');
        await saving;
        expect(editor.getValue()).toBe(`another task\n${task}\n- [ ] [[Task]] ${entry.recorded}`);
    });
    it('leaves ambiguous duplicate rows untouched without editor history and reuses the successful save', async () => {
        const { edit, editor, write } = makeEditor(task + '\n' + task, false);
        const save = vi.fn(async () => {});
        const saving = write(1, entry, save);
        edit(0, 0, 'another task\n');
        expect(await saving).toBe(false);
        expect(await write(2, entry, save)).toBe(false);
        expect(save).toHaveBeenCalledTimes(1);
        expect(editor.getValue()).toBe(`another task\n${task}\n${task}`);
    });
    it('keeps a failed or skipped save pending and permits retry', async () => {
        const { editor, write } = makeEditor(task);
        expect(await write(0, entry, async () => { throw new Error('write failed'); })).toBe(false);
        expect(await write(0, entry, async () => false)).toBe(false);
        expect(editor.getValue()).toBe(task);
        expect(await write(0, entry, async () => {})).toBe(true);
        expect(editor.getValue()).toContain(entry.recorded);
    });
    it('acknowledges in the original file if the editor switched away', async () => {
        const { edit, editor, view, plugin, write } = makeEditor(task);
        let savedText = 'another task\n' + task;
        const process = vi.fn(async (_: unknown, modify: (text: string) => string) => { savedText = modify(savedText); });
        plugin.app = { vault: { process } };
        const source = view.file;
        const saving = write(0, entry, async () => {});
        view.file = Object.assign(new TFile(), { path: 'other.md' });
        edit(0, task.length, task + ' in another file');
        expect(await saving).toBe(true);
        expect(process.mock.calls[0][0]).toBe(source);
        expect(savedText).toBe(`another task\n- [ ] [[Task]] ${entry.recorded}`);
        expect(editor.getValue()).toContain(entry.marker);
    });
});

it('retries only the daily acknowledgment after the routine save succeeded and the editor switched files', async () => {
    const text = '- [ ] [[Task]] @done';
    const { plugin, editor, view, routine, source } = makeEditor(text);
    const processCompletion = vi.fn(async () => {});
    const eligible = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    Object.assign(editor, { lastLine: () => 0 });
    Object.assign(plugin, {
        app: { vault: { process: async () => { throw new Error('daily temporarily unavailable'); } } },
        ensureDailyNoteView: () => true, isFutureDailyNoteFile: () => false, parseDailyNoteDate: () => new Date(),
        shouldApplyAtDoneToRoutine: eligible,
        routineEngine: { readRoutineNote: () => ({ file: routine }), processCompletion },
    });
    const context = { file: source, editor, view, reason: 'test' };
    const first = plugin.processPendingRoutineAtDoneMarkersInEditor(context);
    view.file = Object.assign(new TFile(), { path: 'other.md' });
    expect(await first).toBe(0);
    expect(editor.getValue()).toBe(text);
    view.file = source;
    expect(await plugin.processPendingRoutineAtDoneMarkersInEditor(context)).toBe(1);
    expect(editor.getValue()).toBe('- [ ] [[Task]] →done');
    expect(processCompletion).toHaveBeenCalledTimes(1);
    expect(plugin.markerSaves.size).toBe(0);
});

it('does not also schedule a normal completion when the user removes @done while metadata processing is saving it', async () => {
    const text = '- [x] [[Task]] @done';
    const { plugin, editor, view, source, routine, edit } = makeEditor(text);
    let release!: () => void;
    const processCompletion = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const scheduleUpdate = vi.fn();
    const blankEntry = () => ({ completedCount: 0, completedSignatures: new Set<string>(), atDoneCompletedSignatures: new Set<string>() });
    let previous = new Map([[routine.path, blankEntry()]]);
    Object.assign(plugin, {
        app: { workspace: { getActiveViewOfType: () => view }, vault: { getAbstractFileByPath: () => routine } },
        isDailyNoteFile: () => true, ensureDailyNoteView: () => true, isFutureDailyNoteFile: () => false,
        parseDailyNoteDate: () => new Date(), shouldApplyAtDoneToRoutine: () => true, replenishSrsBatchIfNeeded: vi.fn(),
        routineEngine: { readRoutineNote: () => ({ file: routine }), processCompletion, scheduleUpdate },
        snapshots: {
            build: () => new Map([[routine.path, { ...blankEntry(), completedCount: 1,
                completedSignatures: new Set(['0:' + editor.getValue().trim()]) }]]),
            get: () => previous, set: (_path: string, next: typeof previous) => { previous = next; },
            createEmptyEntry: blankEntry,
        },
    });
    Object.assign(editor, { lastLine: () => 0 });
    const observing = plugin.onMetadataChanged(source);
    edit(text.indexOf('@done'), text.length, '');
    const observingAgain = plugin.onMetadataChanged(source);
    release();
    await Promise.all([observing, observingAgain]);
    expect(processCompletion).toHaveBeenCalledTimes(1);
    expect(scheduleUpdate.mock.calls.flatMap(call => call[2] ? [call[2]] : [])).toEqual([]);
    expect(plugin.completedMarkerSaves.size).toBe(0);
});
