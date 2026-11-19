import { describe, expect, it } from 'vitest';
import { buildReflectionTimeline } from '../src/service/reflection-timeline';

const options = {
    sections: [{ value: 1730, label: '夕方' }, { value: 1800, label: '晩ごはん' }, { value: 2100, label: '夜' }, { value: 2359, label: '深夜' }],
    isSleep: () => false,
    getSections: (line: string) => line.includes('晩ごはん') ? [1800] : line.includes('促し') ? [2100] : undefined,
};
const note = `# 夕方
- [ ] ジョギング (70m)
# 晩ごはん
- [ ] 17:50 晩ごはん (70m)
- [ ] 20:45 促し (15m)
# 夜
- [ ] 充電 (5m)
- [ ] 音楽 (60m)
- [ ] お風呂 (30m)`;

describe('routine start and section have separate meaning', () => {
    it('anchors dinner at 18 and the reminder at 21 without moving the expanded note', () => {
        const result = buildReflectionTimeline(note, 3, options, 16 * 60);
        const title = (hour: number) => result.tasks[result.hours[hour].representativeTaskId!]?.title;
        expect(title(17)).toBe('ジョギング');
        expect(title(18)).toBe('晩ごはん');
        expect(title(21)).toBe('促し');
        expect(title(22)).toBe('音楽');
        expect(title(23)).toBe('お風呂');
        expect(result.blocks.find(block => block.title === '晩ごはん')?.plannedStart).toBe('17:50');
        expect(result.blocks.find(block => block.title === '促し')?.plannedStart).toBe('20:45');
        expect(result.tasks.find(task => task.title === '促し')?.source).toBe('- [ ] 20:45 促し (15m)');
        expect(result.blocks.find(block => block.title === 'お風呂')?.tasks.map(task => task.title)).toContain('充電');
    });
    it('keeps an unfinished 21-hour reminder in that hour after its nominal fifteen minutes pass', () => {
        const result = buildReflectionTimeline(note, 3, options, 21 * 60 + 20);
        expect(result.tasks[result.hours[21].representativeTaskId!]?.title).toBe('促し');
    });
    it('uses actual times after completion instead of its section anchor', () => {
        const completed = note.replace('- [ ] 20:45 促し (15m)', '- [x] 20:45 促し 20:46 - 20:52 (15m > 6m)');
        const result = buildReflectionTimeline(completed, 3, options, 20 * 60 + 55);
        const task = result.tasks.find(task => task.title === '促し')!;
        expect([task.startMinute, task.endMinute, task.isPlanned]).toEqual([1246, 1252, false]);
        expect(result.tasks[result.hours[21].representativeTaskId!]?.title).not.toBe('促し');
    });
    it('does not move a later explicit start earlier to the beginning of its section', () => {
        const result = buildReflectionTimeline(note.replace('17:50', '19:00'), 3, options, 16 * 60);
        expect(result.tasks[result.hours[19].representativeTaskId!]?.title).toBe('晩ごはん');
        expect(result.tasks[result.hours[18].representativeTaskId!]?.title).not.toBe('晩ごはん');
    });
    it('ignores invalid or ambiguous metadata instead of guessing a new section', () => {
        for (const getSections of [() => [NaN], () => [9999], () => [1800, 2100]]) {
            const result = buildReflectionTimeline(note, 3, { ...options, getSections }, 16 * 60);
            expect(result.tasks[result.hours[21].representativeTaskId!]?.title).toBe('音楽');
        }
    });
    it('lets recorded and running activity take priority over the section anchor', () => {
        for (const actual of ['- [x] 実績 21:00 - 21:40 (40m)', '- [/] 実行中 21:00 - ']) {
            const result = buildReflectionTimeline(`${note}\n${actual}`, 3, options, 21 * 60 + 20);
            expect(result.tasks[result.hours[21].representativeTaskId!]?.isPlanned).toBe(false);
            expect(result.tasks.some(task => task.title === '促し')).toBe(true);
        }
    });
    it('normalizes a midnight start before comparing it with its section', () => {
        const result = buildReflectionTimeline('# 深夜\n- [ ] 00:45 促し (15m)', 3,
            { ...options, getSections: () => [2400] }, 23 * 60);
        const task = result.tasks.find(task => task.title === '促し')!;
        expect(task.startMinute).toBe(24 * 60 + 45);
        expect(task.anchorHour).toBe(24);
        expect(task.plannedStart).toBe('00:45');
    });

});
