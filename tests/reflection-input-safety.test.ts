import { describe, expect, it } from 'vitest';
import { buildReflectionTimeline } from '../src/service/reflection-timeline';

const taskRows = (result: ReturnType<typeof buildReflectionTimeline>) =>
    result.tasks.filter(task => task.kind === 'task');

const blockTaskIds = (result: ReturnType<typeof buildReflectionTimeline>) =>
    result.blocks.flatMap(block => block.tasks.map(task => task.id));

describe('reflection timeline input safety', () => {
    it('uses elapsed length rather than a morning/evening clock boundary to infer midnight', () => {
        const result = buildReflectionTimeline([
            '- [x] 夜間 22:00 - 06:00',
            '- [x] 深夜逆転 00:20 - 00:10',
            '- [x] 境界 18:00 - 06:00',
            '- [x] 長時間逆転 20:00 - 09:00',
        ].join('\n'));
        expect(result.tasks.map(task => (task.endMinute ?? 0) - (task.startMinute ?? 0))).toEqual([480, 0, 720, 0]);
    });
    it('does not reinstate a stale running row in a later hour after a completed handoff', () => {
        const note = '- [/] A 10:00 -\n- [x] B 11:00 - 11:15';
        const result = buildReflectionTimeline(note, 3, undefined, 12 * 60 + 10);
        expect(result.hours[12].representativeTaskId).toBeNull();
        expect(blockTaskIds(result).sort()).toEqual(result.tasks.map(task => task.id).sort());
        expect(buildReflectionTimeline(note, 3, undefined, 12 * 60 + 10)).toEqual(result);
    });
    it('bounds generated hour blocks for an extreme estimate without changing the raw value', () => {
        const note = '- [ ] 12:00 巨大見積 (1000000000m)';
        const result = buildReflectionTimeline(note);
        expect(result.tasks[0].source).toBe(note);
        expect(result.blocks.length).toBeLessThanOrEqual(48);
        expect(result.blocks.every(block => Number.isFinite(block.startMinute) && Number.isFinite(block.endMinute) && block.endMinute! <= 51 * 60)).toBe(true);
    });
    it('keeps a reversed daytime interval at zero duration and retains the original source', () => {
        const line = '- [x] 短い記録 14:22 - 14:21';
        const result = buildReflectionTimeline(line);
        const task = taskRows(result)[0];

        expect(task.actualStart).toBe('14:22');
        expect(task.actualEnd).toBe('14:21');
        expect(task.source).toBe(line);
        expect(task.startMinute).toBe(14 * 60 + 22);
        expect(task.endMinute).toBe(14 * 60 + 22);
        expect(result.withoutActualInterval).toContain(task.id);
    });

    it('preserves an exact 13-hour sleep interval with the sleep callback, including without preview data', () => {
        const line = '- [x] 睡眠 20:00 - 09:00';
        const result = buildReflectionTimeline(line, 3, undefined, 10 * 60, {
            isSleep: candidate => candidate.includes('睡眠'),
        });
        const task = taskRows(result)[0];

        expect(task.startMinute).toBe(20 * 60);
        expect(task.endMinute).toBe(33 * 60);
        expect(task.endMinute! - task.startMinute!).toBe(13 * 60);
        expect(task.source).toBe(line);
    });

    it('leaves ordinary overnight and cutoff-crossing durations intact', () => {
        const result = buildReflectionTimeline([
            '- [x] 夜の作業 23:50 - 00:10',
            '- [x] 朝の作業 02:30 - 03:30',
        ].join('\n'));

        expect(taskRows(result).map(task => [task.startMinute, task.endMinute])).toEqual([
            [1430, 1450], [1590, 1650],
        ]);
    });

    it.each(['14:222', '144:22', '14:60', '99:99', 'no-clock'])('retains malformed or missing clock text (%s) without creating a bogus interval', rawClock => {
        const malformed = `- [x] 入力 ${rawClock} - ${rawClock}`;
        const neighbor = '- [x] 正常 15:00 - 15:20';
        const markdown = [malformed, neighbor].join('\n');
        const result = buildReflectionTimeline(markdown);
        const tasks = taskRows(result);

        expect(tasks.map(task => task.source)).toEqual([malformed, neighbor]);
        expect(tasks[0].actualStart).toBe('');
        expect(tasks[0].actualEnd).toBe('');
        expect(tasks[0].startMinute).toBeNull();
        expect(tasks[0].endMinute).toBeNull();
        expect(result.withoutActualInterval).toContain(tasks[0].id);
        expect([tasks[1].startMinute, tasks[1].endMinute]).toEqual([900, 920]);
        expect(result.blocks.flatMap(block => block.tasks)).toContainEqual(tasks[0]);
        expect(result.blocks.some(block => block.startMinute === 15 * 60 && block.endMinute === 16 * 60)).toBe(true);
    });

    it('selects a running task that starts in the current hour while keeping prior-hour overlap unchanged', () => {
        const result = buildReflectionTimeline([
            '- [/] A 10:00 -',
            '- [/] B 10:40 -',
            '- [/] C 11:20 -',
        ].join('\n'), 3, undefined, 11 * 60 + 30);
        const tasks = taskRows(result);

        expect(result.hours[10].representativeTaskId).toBe(tasks[0].id);
        expect(result.hours[11].representativeTaskId).toBe(tasks[2].id);
        expect(blockTaskIds(result).sort()).toEqual(tasks.map(task => task.id).sort());
    });

    it('keeps the earlier running task representative when another starts just before the current hour', () => {
        const result = buildReflectionTimeline([
            '- [/] A 10:00 -',
            '- [/] B 10:59 -',
        ].join('\n'), 3, undefined, 11 * 60 + 30);
        const tasks = taskRows(result);

        expect(result.hours[11].representativeTaskId).toBe(tasks[0].id);
        expect(blockTaskIds(result).sort()).toEqual(tasks.map(task => task.id).sort());
    });

    it('switches the current-hour representative when the next running task starts on the hour', () => {
        const result = buildReflectionTimeline([
            '- [/] A 10:00 -',
            '- [/] B 11:00 -',
        ].join('\n'), 3, undefined, 11 * 60 + 30);
        const tasks = taskRows(result);

        expect(result.hours[11].representativeTaskId).toBe(tasks[1].id);
        expect(blockTaskIds(result).sort()).toEqual(tasks.map(task => task.id).sort());
    });

    it('lets a task completed in the current hour represent it over an older still-running task', () => {
        const result = buildReflectionTimeline([
            '- [/] A 10:00 -',
            '- [x] B 11:00 - 11:15',
        ].join('\n'), 3, undefined, 11 * 60 + 30);
        const tasks = taskRows(result);

        expect(result.hours[11].representativeTaskId).toBe(tasks[1].id);
        expect(blockTaskIds(result).sort()).toEqual(tasks.map(task => task.id).sort());
    });

    it('rebuilds the same timeline deterministically after reload and retains duplicate source rows', () => {
        const duplicate = '- [x] 同じ記録 10:00 - 10:15';
        const markdown = [duplicate, duplicate, '- [/] 実行中 11:00 -'].join('\n');
        const first = buildReflectionTimeline(markdown, 3, undefined, 11 * 60 + 30);
        const afterReload = buildReflectionTimeline(markdown, 3, undefined, 11 * 60 + 30);

        expect(taskRows(first)).toHaveLength(3);
        expect(taskRows(first).slice(0, 2).map(task => task.source)).toEqual([duplicate, duplicate]);
        expect(afterReload).toEqual(first);
        expect(blockTaskIds(first).sort()).toEqual(taskRows(first).map(task => task.id).sort());
    });
});
