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

        expect(result.tasks.map(t => t.title)).toEqual(['読書', '別セクション']);
        expect(result.tasks[0].sourceLine).toBe(5);
        expect(result.tasks[0].supplements).toBe('  補足の一行目\n  補足の二行目');
        expect(result.withoutActualInterval).toEqual([]);
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
        expect(result.withoutActualInterval).toEqual([2]);
        const assigned = result.blocks.flatMap(block => block.tasks.map(task => task.id));
        expect(new Set(assigned).size).toBe(assigned.length);
        expect(assigned.sort()).toEqual([0, 1, 2]);
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
        expect(result.tasks.filter(task => task.kind === 'task').map(task => task.title)).toEqual(['first', 'second', 'SRS [[Question]]']);
        expect(result.tasks.at(-1)?.supplement).toBe('~~~md\n```\n- [x] not a record\n~~~');
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
        expect(result.tasks.some(task => task.kind === 'task' && task.status !== 'x')).toBe(true);
    });

    it('keeps unindented multi-paragraph task memos and blank lines up to the next record', () => {
        const result = buildReflectionTimeline([
            '- [x] [[Task]] 10:00 - 11:00',
            '📝 nonindented memo', '', 'more text', 'https://example.com', '',
            '- [x] next 11:00 - 12:00',
        ].join('\n'));
        expect(result.tasks).toHaveLength(2);
        expect(result.tasks[0].supplement).toBe('📝 nonindented memo\n\nmore text\nhttps://example.com');
        expect(result.tasks[0].title).toBe('[[Task]]');
        expect(result.tasks[0].kind).toBe('task');
    });

    it('returns memo-only prose as source-lined items and excludes headings, fences, and LLR controls', () => {
        const result = buildReflectionTimeline([
            '冒頭のメモ', '続き', '', '## Tasks',
            '- [x] [[Alias]] 10:00 - 11:00',
            '本文のメモ',
            '<!-- llr:batch start -->',
            '## After',
            '締めのメモ',
            '```md', '- [x] fake 12:00 - 13:00', '```',
        ].join('\n'));
        expect(result.tasks.map(task => task.kind)).toEqual(['memo', 'task', 'memo']);
        expect(result.tasks[0].title).toBe('メモ');
        expect(result.tasks[0].sourceLine).toBe(1);
        expect(result.tasks[0].supplement).toBe('冒頭のメモ\n続き');
        expect(result.tasks[1].title).toBe('[[Alias]]');
        expect(result.tasks[1].supplement).toBe('本文のメモ');
        expect(result.tasks[2].sourceLine).toBe(9);
        expect(result.tasks[2].supplement).toBe('締めのメモ\n```md\n- [x] fake 12:00 - 13:00\n```');
        expect(result.tasks[1].actualStart).toBe('10:00');
        expect(result.tasks.filter(task => task.kind === 'memo').every(task => task.startMinute === null)).toBe(true);
    });

    it('keeps task-like fenced examples inside task memos without duplicating them', () => {
        const result = buildReflectionTimeline([
            '- [x] work 10:00 - 11:00',
            'memo before code', '```md', '- [x] fake 12:00 - 13:00', '```', 'memo after code',
            '- [x] next 11:00 - 12:00',
        ].join('\n'));
        expect(result.tasks.map(task => task.title)).toEqual(['work', 'next']);
        expect(result.tasks[0].supplement).toBe('memo before code\n```md\n- [x] fake 12:00 - 13:00\n```\nmemo after code');
    });

    it('preserves standalone fenced memo examples and treats indented checkboxes as nested memo bullets', () => {
        const result = buildReflectionTimeline([
            '## Notes', 'Before example', '~~~txt', '- [x] fake 08:00 - 09:00', '~~~',
            '- [x] actual 10:00 - 11:00', '  - [ ] nested checklist', '    detail',
            '- [x] next 11:00 - 12:00',
        ].join('\n'));
        expect(result.tasks.map(task => task.kind)).toEqual(['memo', 'task', 'task']);
        expect(result.tasks[0].supplement).toBe('Before example\n~~~txt\n- [x] fake 08:00 - 09:00\n~~~');
        expect(result.tasks[1].supplement).toBe('  - [ ] nested checklist\n    detail');
        expect(result.tasks[1].title).toBe('actual');
    });

    it('defaults to completed checkbox records while retaining plain bullets and standalone memo prose', () => {
        const result = buildReflectionTimeline([
            '- [ ] unchecked 08:00 - 09:00',
            '- [/] in progress 09:00 - 10:00',
            '- [x] completed 10:00 - 11:00',
            '  - [ ] nested checklist stays in original memo',
            '## Notes', '- ordinary bullet',
            '## More notes',
            'standalone memo',
        ].join('\n'));

        expect(result.tasks.map(task => task.kind)).toEqual(['task', 'task', 'memo']);
        expect(result.tasks[0].supplement).toContain('- [ ] nested checklist stays in original memo');
        expect(result.tasks[1].status).not.toBe('x');
        expect(result.tasks[2].supplement).toBe('standalone memo');
    });

    it('omits SRS start-to-end/done regions, keeps linked notes outside, and ignores marker examples in fences', () => {
        const result = buildReflectionTimeline([
            '- [x] [[Outside SRS]] 08:00 - 09:00',
            '<!-- llr:srs start -->',
            '- [x] [[Inside end]] 09:00 - 10:00',
            '<!-- llr:srs end -->',
            '- [x] [[Between]] 10:00 - 11:00',
            'outside batch memo',
            '<!-- llr:srs start -->',
            '- [x] [[Inside done]] 11:00 - 12:00',
            '<!-- llr:srs done -->',
            '```md', '<!-- llr:srs start -->', '- [x] [[Example]] 12:00 - 13:00', '<!-- llr:srs end -->', '```',
            '- [x] [[After]] 13:00 - 14:00',
        ].join('\n'));

        expect(result.tasks.filter(task => task.kind === 'task').map(task => task.title)).toEqual([
            '[[Outside SRS]]', '[[Between]]', '[[After]]',
        ]);
        expect(result.tasks.find(task => task.title === '[[Between]]')?.supplement).toBe('outside batch memo');
        expect(result.tasks.map(task => task.sourceLine)).toEqual([1, 5, 10, 15]);
    });

    it('omits an unclosed SRS batch only through end of note', () => {
        const result = buildReflectionTimeline([
            '- [x] before 08:00 - 09:00', '<!-- llr:srs start -->',
            '- [x] inside 09:00 - 10:00', 'memo inside',
        ].join('\n'));
        expect(result.tasks.map(task => task.title)).toEqual(['before']);
    });
});
