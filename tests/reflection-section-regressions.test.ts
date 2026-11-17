import { describe, expect, it } from 'vitest';
import { buildReflectionTimeline } from '../src/service/reflection-timeline';

const preview = {
    sections: [{ value: 1300, label: '午後' }, { value: 2100, label: '夜' }, { value: 2359, label: '深夜' }],
    isSleep: () => false,
};

describe('section and source-order regressions', () => {
    it.each(['```md\n# 夜\n```', '~~~md\n# 夜\n~~~'])('ignores section headings inside code examples: %s', example => {
        const original = '# 午後\n- [ ] A\n- [ ] B';
        const modified = `# 午後\n- [ ] A\n${example}\n- [ ] B`;
        const before = buildReflectionTimeline(original, 3, preview, 13 * 60);
        const after = buildReflectionTimeline(modified, 3, preview, 13 * 60);
        expect(after.tasks.map(task => [task.title, task.startMinute, task.endMinute]))
            .toEqual(before.tasks.map(task => [task.title, task.startMinute, task.endMinute]));
        expect(after.blocks.map(block => [block.title, block.startMinute, block.endMinute]))
            .toEqual(before.blocks.map(block => [block.title, block.startMinute, block.endMinute]));
    });
    it('keeps a planned clock before an untimed candidate in source order within the expansion', () => {
        const note = '# 夜\n- [ ] 22:30 hidden (5m)\n- [ ] zero\n- [ ] music (180m)';
        const result = buildReflectionTimeline(note, 3, preview, 20 * 60);
        const block = result.blocks.find(block => block.title === 'music')!;
        expect([block.startMinute, block.endMinute]).toEqual([1260, 1440]);
        expect(block.tasks.map(task => task.title)).toEqual(['hidden', 'zero', 'music']);
        expect(block.tasks.map(task => task.source)).toEqual(note.split('\n').slice(1));
    });
    it('keeps hidden plans in source order inside a completed band as well', () => {
        const note = '# 夜\n- [ ] 21:30 hidden (5m)\n- [ ] zero\n- [x] later 21:30 - 21:45\n- [x] actual 21:00 - 23:59';
        const result = buildReflectionTimeline(note, 3, preview, 20 * 60);
        const block = result.blocks.find(block => block.title === 'actual')!;
        expect(block.tasks.filter(task => task.isPlanned).map(task => task.title)).toEqual(['hidden', 'zero']);
        expect(block.isPlanned).toBe(false);
        expect(block.tasks.filter(task => !task.isPlanned).map(task => task.title)).toEqual(['actual', 'later']);
        expect(result.blocks.flatMap(block => block.tasks)).toHaveLength(result.tasks.length);
    });
});
