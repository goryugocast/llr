import { describe, expect, it } from 'vitest';
import { buildReflectionTimeline } from '../src/service/reflection-timeline';

describe('buildReflectionTimeline', () => {
    it('parses task records and keeps multiline supplements without consuming later records or headings', () => {
        const result = buildReflectionTimeline([
            '---', 'title: fake', '---', '# Daily',
            '- [x] 08:00 読書 08:10 - 08:40 (30m)',
            '  補足の一行目', '  補足の二行目',
            '- [ ] 09:00 予定のみ',
            '## Next', '- [x] 10:00 別セクション 10:00 - 10:10',
            '```md', '- [x] 12:00 code 12:00 - 12:30', '```',
        ].join('\n'));

        expect(result.tasks.map(t => t.title)).toEqual(['読書', '予定のみ', '別セクション']);
        expect(result.tasks[0].sourceLine).toBe(5);
        expect(result.tasks[0].supplements).toBe('  補足の一行目\n  補足の二行目');
        expect(result.tasks[1].actualStart).toBe('');
        expect(result.withoutActualInterval).toEqual([1]);
    });

    it('uses actual overlap, wraps midnight, preserves zero duration and assigns a task once', () => {
        const result = buildReflectionTimeline([
            '- [x] 22:00 夜の作業 23:30 - 01:30',
            '- [x] 23:00 短い作業 23:40 - 00:10',
            '- [x] planned 00:00 - 00:00',
            '- [ ] 23:50 予定だけ',
            '- [/] 実行中 02:20 -',
        ].join('\n'));

        expect(result.tasks[0].startMinute).toBe(1410);
        expect(result.tasks[0].endMinute).toBe(1530);
        expect(result.hours[23].representativeTaskId).toBe(0);
        expect(result.hours[0].representativeTaskId).toBe(0);
        expect(result.tasks[2].startMinute).toBe(1440);
        expect(result.withoutActualInterval).toEqual([2, 3, 4]);
        const assigned = result.blocks.flatMap(block => block.tasks.map(task => task.id));
        expect(new Set(assigned).size).toBe(assigned.length);
        expect(assigned.sort()).toEqual([0, 1, 2, 3, 4]);
    });

    it('keeps the cutoff-crossing hour on one absolute axis and treats nested bullets as supplements', () => {
        const result = buildReflectionTimeline([
            '- [x] cutoff 02:30 - 03:30',
            '  - 原メモの箇条書き',
            '  ~~~note',
            '  - [x] code-like 03:00 - 04:00',
            '  ~~~',
        ].join('\n'));

        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0].supplement).toContain('- 原メモの箇条書き');
        expect(result.blocks[0].startMinute).toBe(1560);
        expect(result.blocks[0].endMinute).toBe(1680);
        expect(result.tasks[0].supplement).toContain('  - [x] code-like 03:00 - 04:00');
        expect(result.blocks[0].tasks.map(task => task.id)).toEqual([0]);
    });

    it('preserves tasks, source order and nested supplement formatting without parsing examples', () => {
        const result = buildReflectionTimeline([
            '- [x] first 10:00 - 11:00',
            '  補足', '    - 深い箇条書き', '  ````md',
            '  ```', '  - [x] example 10:00 - 11:00', '  ````',
            '- [x] second 08:00 - 09:00',
            '- [x] SRS [[Question]] (0m)',
            '~~~md', '```', '- [x] not a record', '~~~',
        ].join('\n'));
        expect(result.tasks.map(task => task.title)).toEqual(['first', 'second', 'SRS [[Question]]']);
        expect(result.tasks[0].supplement).toContain('    - 深い箇条書き');
        expect(result.tasks[1].line).toBe(7);
        expect(result.blocks.flatMap(block => block.tasks.map(task => task.id)).sort()).toEqual([0, 1, 2]);
    });

    it('assigns hourly ties to source order and changes the day boundary when configured', () => {
        const result = buildReflectionTimeline([
            '- [x] early 02:30 - 03:30',
            '- [x] tie 10:00 - 10:30',
            '- [x] tie2 10:30 - 11:00',
            '- Summary: noted',
        ].join('\n'), 4);

        expect(result.hours[10].representativeTaskId).toBe(1);
        expect(result.tasks[0].startMinute).toBe(1590);
        expect(result.tasks[3].title).toBe('Summary: noted');
    });
});
