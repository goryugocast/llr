import { describe, expect, it } from 'vitest';
import { buildReflectionTimeline } from '../src/service/reflection-timeline';

describe('buildReflectionTimeline', () => {
    it('shows running activity through now ahead of plans and removes elapsed plans', () => {
        const result = buildReflectionTimeline([
            '# 朝', '- [ ] 音楽練習 (60m)',
            '# 午後', '- [ ] 午後の予定', '- [/] 実行中 13:10 -',
            '- [ ] 12:00 過ぎた予約 (30m)',
        ].join('\n'), 3, {
            sections: [{ value: 600, label: '朝' }, { value: 1300, label: '午後' }, { value: 1700, label: '夕方' }],
            isSleep: () => false,
        }, 14 * 60 + 20);
        expect(result.tasks.map(task => task.title)).toEqual(['音楽練習', '午後の予定', '実行中', '過ぎた予約']);
        expect(result.blocks.flatMap(block => block.tasks).map(task => task.title).sort()).toEqual(result.tasks.map(task => task.title).sort());
        expect(result.tasks.find(task => task.status === '/')?.endMinute).toBe(860);
        expect(result.blocks.map(block => [block.startMinute, block.endMinute, block.title])).toEqual([
            [780, 900, '実行中'], [900, 960, '午後の予定'], [null, null, '音楽練習'],
        ]);
    });

    it('normalizes running activity and now across midnight on the logical day', () => {
        const result = buildReflectionTimeline('- [/] 夜の作業 23:30 -', 3, undefined, 30);
        expect(result.tasks[0].startMinute).toBe(1410);
        expect(result.tasks[0].endMinute).toBe(1470);
    });

    it('gives recorded activity priority over a longer plan and only fills empty hours with plans', () => {
        const result = buildReflectionTimeline([
            '# 午後',
            '- [ ] 予定',
            '- [x] 実績 14:10 - 14:20',
        ].join('\n'), 3, {
            sections: [{ value: 1300, label: '午後' }, { value: 1600, label: '夕方' }],
            isSleep: () => false,
        });
        expect(result.blocks.map(block => [block.startMinute, block.endMinute, block.title])).toEqual([
            [780, 840, '予定'], [840, 900, '実績'],
        ]);
        expect(result.blocks.find(block => !block.isPlanned)?.tasks.map(task => task.title)).toEqual(['実績']);
    });

    it('does not recreate a plan fully covered by actual records as an overlapping block', () => {
        const result = buildReflectionTimeline([
            '- [ ] 14:00 予定 (30m)',
            '- [x] 実績 14:10 - 14:20',
        ].join('\n'));
        expect(result.blocks.map(block => block.title)).toEqual(['実績']);
        expect(result.blocks[0].tasks.map(task => task.title)).toEqual(['実績']);
    });

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

    it('uses actual time instead of planned time and never invents an interval from a plan alone', () => {
        const result = buildReflectionTimeline([
            '- [x] 02:30 afternoon work 14:10 - 14:40',
            '- [x] 07:00 planned only',
        ].join('\n'));

        expect(result.tasks[0].startMinute).toBe(850);
        expect(result.tasks[0].endMinute).toBe(880);
        expect(result.blocks.some(block => block.startMinute === 14 * 60)).toBe(true);
        expect(result.blocks.some(block => block.startMinute === 2 * 60)).toBe(false);
        expect(result.tasks[1].actualStart).toBe('');
        expect(result.tasks[1].startMinute).toBeNull();
        expect(result.tasks[1].endMinute).toBeNull();
        expect(result.withoutActualInterval).toContain(result.tasks[1].id);
        expect(result.blocks.find(block => block.title === '実績時刻のない記録')?.tasks).toContainEqual(result.tasks[1]);
    });

    it('splits representative runs but assigns an overlapping source task only once', () => {
        const result = buildReflectionTimeline([
            '- [x] B 09:00 - 11:00',
            '- [x] A 08:00 - 12:00',
        ].join('\n'));

        const runs = result.blocks.filter(block => block.startMinute !== null);
        expect(runs.map(block => [block.startMinute, block.endMinute, block.title])).toEqual([
            [480, 540, 'A'], [540, 660, 'B'], [660, 720, 'A'],
        ]);
        expect(runs.map(block => block.tasks.map(task => task.id))).toEqual([[], [1, 0], []]);
        const assigned = runs.flatMap(block => block.tasks.map(task => task.id));
        expect(assigned.sort()).toEqual([0, 1]);
        expect(new Set(assigned).size).toBe(assigned.length);
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

    it('ignores fixed preamble prose but returns section memo as a source-lined item', () => {
        const result = buildReflectionTimeline([
            '冒頭のメモ', '続き', '', '## Tasks',
            '- [x] [[Alias]] 10:00 - 11:00',
            '本文のメモ',
            '<!-- llr:batch start -->',
            '## After',
            '締めのメモ',
            '```md', '- [x] fake 12:00 - 13:00', '```',
        ].join('\n'));
        expect(result.tasks.map(task => task.kind)).toEqual(['task', 'memo']);
        expect(result.tasks[0].title).toBe('[[Alias]]');
        expect(result.tasks[0].supplement).toBe('本文のメモ');
        expect(result.tasks[1].sourceLine).toBe(9);
        expect(result.tasks[1].supplement).toBe('締めのメモ\n```md\n- [x] fake 12:00 - 13:00\n```');
        expect(result.tasks[0].actualStart).toBe('10:00');
        expect(result.tasks.filter(task => task.kind === 'memo').every(task => task.startMinute === null)).toBe(true);
    });

    it('does not extract name and mission prose before the first heading or record', () => {
        const result = buildReflectionTimeline([
            '---', 'title: Daily', '---', 'ごりゅご', '今日の使命', '```md', '# example', '```',
            '- [x] work 10:00 - 11:00', '  作業の補足', '補足の続き',
        ].join('\n'));

        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0].kind).toBe('task');
        expect(result.tasks[0].sourceLine).toBe(9);
        expect(result.tasks[0].supplement).toBe('  作業の補足\n補足の続き');
    });

    it('returns no timeline items for a document containing only fixed preamble', () => {
        const result = buildReflectionTimeline(['---', 'title: Daily', '---', 'Name', 'Mission', ''].join('\n'));
        expect(result.tasks).toEqual([]);
        expect(result.blocks).toEqual([]);
    });

    it('retains standalone memo prose after an explicit memo heading', () => {
        const result = buildReflectionTimeline(['Name', 'Mission', '## メモ', '独立した記録'].join('\n'));
        expect(result.tasks.map(task => task.kind)).toEqual(['memo']);
        expect(result.tasks[0].sourceLine).toBe(4);
        expect(result.tasks[0].supplement).toBe('独立した記録');
    });

    it('recognizes a record as the start of content without a preceding heading', () => {
        const result = buildReflectionTimeline([
            'Fixed introduction', '- [x] work 10:00 - 11:00',
            '<!-- llr:routines-expanded 2026-11-05 -->',
            'A separate memo after a record',
        ].join('\n'));
        expect(result.tasks.map(task => task.kind)).toEqual(['task', 'memo']);
        expect(result.tasks[1].supplement).toBe('A separate memo after a record');
        expect(result.tasks[1].sourceLine).toBe(4);
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


describe('today section candidate integration', () => {
    it('keeps an all-past backlog readable without recreating a past time band', () => {
        const result = buildReflectionTimeline('# 朝\n- [ ] やり残し', 3, {
            sections: [{ value: 600, label: '朝' }, { value: 900, label: '午前' }], isSleep: () => false,
        }, 14 * 60);
        expect(result.blocks.map(block => [block.startMinute, block.endMinute, block.tasks.map(task => task.title)])).toEqual([[null, null, ['やり残し']]]);
    });
    it('keeps all before-sleep unfinished items reachable even without a section slot', () => {
        const result = buildReflectionTimeline([
            '# 朝', '- [ ] 朝のやり残し',
            '# 午後', '- [ ] 枠なし候補', '- [ ] 15:00 見積なし予約',
            '- [x] 実績 14:00 - 18:00',
            '# 任意の見出し', '- [ ] 見出し不一致',
            '# 夜', '- [ ] 睡眠', '- [ ] 23:00 睡眠後予約 (30m)', '- [ ] 睡眠後候補',
        ].join('\n'), 3, {
            sections: [{ value: 600, label: '朝' }, { value: 1400, label: '午後' }, { value: 1800, label: '夜' }],
            isSleep: line => line.includes('睡眠') && !line.includes('睡眠後'),
        }, 16 * 60);
        const visible = result.blocks.flatMap(block => block.tasks).filter(task => task.status === ' ').map(task => task.title);
        expect(visible.sort()).toEqual(['朝のやり残し', '枠なし候補', '見積なし予約', '見出し不一致', '睡眠'].sort());
        expect(new Set(visible).size).toBe(visible.length);
        expect(result.blocks.filter(block => block.isPlanned && block.startMinute !== null).every(block => block.startMinute! >= 16 * 60)).toBe(true);
    });
    const preview = { sections: [{ value: 1400, label: '午後' }, { value: 1800, label: '夜' }], isSleep: (line: string) => line.includes('睡眠') };
    const rows = ['# 午後', '- [ ] テーマ', '- [ ] KS記事', '- [ ] iPad記事', '- [ ] dot'];
    const titles = (lines: string[], now: number) => buildReflectionTimeline(lines.join('\n'), 3, preview, now).blocks.filter(block => block.isPlanned).map(block => block.title);
    it('reselects remaining candidates as the clock advances and tasks complete', () => {
        expect(titles(rows, 14 * 60)).toEqual(['テーマ', 'KS記事', 'iPad記事', 'dot']);
        expect(titles(rows, 16 * 60)).toEqual(['テーマ', 'KS記事']);
        const completed = rows.map(line => line === '- [ ] テーマ' ? '- [x] テーマ 15:00 - 15:30' : line);
        expect(titles(completed, 16 * 60)).toEqual(['KS記事', 'iPad記事']);
        expect(titles(completed, 17 * 60)).toEqual(['KS記事']);
        const result = buildReflectionTimeline(rows.join('\n'), 3, preview, 16 * 60);
        expect(result.blocks.flatMap(block => block.tasks).map(task => task.title).sort()).toEqual(['テーマ', 'KS記事', 'iPad記事', 'dot'].sort());
    });
    it('reserves fixed starts and actual hours before section candidates', () => {
        const result = buildReflectionTimeline([...rows, '- [ ] 16:00 予約 (30m)', '- [x] 実績 17:10 - 17:20'].join('\n'), 3, preview, 15 * 60);
        expect(result.blocks.map(block => block.title)).toEqual(['テーマ', '予約', '実績']);
        expect(result.blocks.filter(block => block.isPlanned).flatMap(block => block.tasks).some(task => task.title === '実績')).toBe(false);
    });
    it('selects by estimate and excludes sleep tail and SRS', () => {
        const lines = ['# 午後', '- [ ] 充電 (5m)', '- [ ] 音楽 (60m)', '- [ ] 風呂 (30m)', '- [ ] 睡眠', '- [ ] 本', '<!-- llr:srs start -->', '- [ ] SRS', '<!-- llr:srs end -->'];
        const result = buildReflectionTimeline(lines.join('\n'), 3, preview, 16 * 60);
        expect(result.blocks.map(block => block.title)).toEqual(['音楽', '風呂']);
        expect(result.tasks.some(task => task.title === '本' || task.title === 'SRS')).toBe(false);
    });
    it('does not add section candidates to a past-day call without preview options', () => {
        expect(buildReflectionTimeline(rows.join('\n')).blocks).toEqual([]);
    });
});
