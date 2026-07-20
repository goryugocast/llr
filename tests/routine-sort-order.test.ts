import { describe, it, expect } from 'vitest';
import { routineSortKey, groupRoutineLinesWithSections, expandRoutineNotesBySection } from '../src/service/routine-sort';

describe('routineSortKey', () => {
    const sort = (items: { section?: number; start?: number }[]) =>
        [...items].sort((a, b) => {
            const [as1, as2] = routineSortKey(a);
            const [bs1, bs2] = routineSortKey(b);
            return as1 !== bs1 ? as1 - bs1 : as2 - bs2;
        });

    it('section 付きルーチンが section 未設定より先に並ぶ', () => {
        const items = [
            { section: undefined, start: 800 },
            { section: 5, start: 900 },
        ];
        const sorted = sort(items);
        expect(sorted[0].section).toBe(5);
        expect(sorted[1].section).toBeUndefined();
    });

    it('section 付きルーチン同士は section 昇順', () => {
        const items = [
            { section: 18, start: 800 },
            { section: 5, start: 900 },
        ];
        const sorted = sort(items);
        expect(sorted[0].section).toBe(5);
        expect(sorted[1].section).toBe(18);
    });

    it('section 未設定同士は start 昇順', () => {
        const items = [
            { section: undefined as number | undefined, start: 1400 },
            { section: undefined as number | undefined, start: 800 },
        ];
        const sorted = sort(items);
        expect(sorted[0].start).toBe(800);
        expect(sorted[1].start).toBe(1400);
    });

    it('同じ section 内は start 昇順', () => {
        const items = [
            { section: 10, start: 1400 },
            { section: 10, start: 800 },
        ];
        const sorted = sort(items);
        expect(sorted[0].start).toBe(800);
        expect(sorted[1].start).toBe(1400);
    });

    it('混在: section 付き → section 未設定 の順で並ぶ', () => {
        const items = [
            { section: undefined, start: 600 },
            { section: 18, start: 1800 },
            { section: undefined, start: 1400 },
            { section: 5, start: 900 },
        ];
        const sorted = sort(items);
        expect(sorted.map(i => i.section)).toEqual([5, 18, undefined, undefined]);
        expect(sorted[2].start).toBe(600);
        expect(sorted[3].start).toBe(1400);
    });

    it('start 未設定は start 設定済みより先', () => {
        const items = [
            { section: 10, start: 800 },
            { section: 10, start: undefined },
        ];
        const sorted = sort(items);
        expect(sorted[0].start).toBeUndefined();
        expect(sorted[1].start).toBe(800);
    });
});

describe('expandRoutineNotesBySection', () => {
    it('section 未設定は1件のまま、section は undefined になる', () => {
        const items = [{ name: 'A', section: undefined as number[] | undefined, start: 800 }];
        const expanded = expandRoutineNotesBySection(items);
        expect(expanded).toEqual([{ name: 'A', section: undefined, start: 800 }]);
    });

    it('section が単一要素の配列でも1件に展開される', () => {
        const items = [{ name: 'A', section: [700], start: 800 }];
        const expanded = expandRoutineNotesBySection(items);
        expect(expanded).toEqual([{ name: 'A', section: 700, start: 800 }]);
    });

    it('section が複数要素の配列なら要素数だけ展開される', () => {
        const items = [{ name: 'A', section: [700, 1900], start: 800 }];
        const expanded = expandRoutineNotesBySection(items);
        expect(expanded).toEqual([
            { name: 'A', section: 700, start: 800 },
            { name: 'A', section: 1900, start: 800 },
        ]);
    });

    it('空配列は未設定と同じ扱いになる', () => {
        const items = [{ name: 'A', section: [] as number[], start: 800 }];
        const expanded = expandRoutineNotesBySection(items);
        expect(expanded).toEqual([{ name: 'A', section: undefined, start: 800 }]);
    });

    it('複数ルーチンが混在しても各ルーチンごとに展開される', () => {
        const items = [
            { name: 'A', section: [700, 1900], start: 800 },
            { name: 'B', section: undefined, start: 900 },
            { name: 'C', section: [1200], start: 1000 },
        ];
        const expanded = expandRoutineNotesBySection(items);
        expect(expanded).toEqual([
            { name: 'A', section: 700, start: 800 },
            { name: 'A', section: 1900, start: 800 },
            { name: 'B', section: undefined, start: 900 },
            { name: 'C', section: 1200, start: 1000 },
        ]);
    });

    it('展開結果はそのまま routineSortKey でソートできる', () => {
        const items = [
            { name: 'A', section: [1900, 700], start: 800 },
            { name: 'B', section: undefined, start: 600 },
        ];
        const expanded = expandRoutineNotesBySection(items);
        const sorted = [...expanded].sort((a, b) => {
            const [as1, as2] = routineSortKey(a);
            const [bs1, bs2] = routineSortKey(b);
            return as1 !== bs1 ? as1 - bs1 : as2 - bs2;
        });
        expect(sorted.map(i => [i.name, i.section])).toEqual([
            ['A', 700],
            ['A', 1900],
            ['B', undefined],
        ]);
    });
});

describe('groupRoutineLinesWithSections', () => {
    it('セクション付き→セクションなしの間に空行を入れる', () => {
        const items = [
            { line: '- [ ] [[朝タスク]]', sectionHeading: '# 朝' },
            { line: '- [ ] [[夜タスク]]', sectionHeading: '# 夜' },
            { line: '- [ ] [[セクションなし]]', sectionHeading: null },
        ];
        const lines = groupRoutineLinesWithSections(items);
        expect(lines).toEqual([
            '# 朝',
            '- [ ] [[朝タスク]]',
            '# 夜',
            '- [ ] [[夜タスク]]',
            '',
            '- [ ] [[セクションなし]]',
        ]);
    });

    it('セクションなしが複数あっても空行は最初の1回だけ', () => {
        const items = [
            { line: '- [ ] [[夜タスク]]', sectionHeading: '# 夜' },
            { line: '- [ ] [[タスクA]]', sectionHeading: null },
            { line: '- [ ] [[タスクB]]', sectionHeading: null },
        ];
        const lines = groupRoutineLinesWithSections(items);
        expect(lines).toEqual([
            '# 夜',
            '- [ ] [[夜タスク]]',
            '',
            '- [ ] [[タスクA]]',
            '- [ ] [[タスクB]]',
        ]);
    });

    it('全部セクション付きなら空行なし', () => {
        const items = [
            { line: '- [ ] [[朝タスク]]', sectionHeading: '# 朝' },
            { line: '- [ ] [[夜タスク]]', sectionHeading: '# 夜' },
        ];
        const lines = groupRoutineLinesWithSections(items);
        expect(lines).toEqual([
            '# 朝',
            '- [ ] [[朝タスク]]',
            '# 夜',
            '- [ ] [[夜タスク]]',
        ]);
    });

    it('全部セクションなしなら見出しも空行もなし', () => {
        const items = [
            { line: '- [ ] [[タスクA]]', sectionHeading: null as string | null },
            { line: '- [ ] [[タスクB]]', sectionHeading: null as string | null },
        ];
        const lines = groupRoutineLinesWithSections(items);
        expect(lines).toEqual([
            '- [ ] [[タスクA]]',
            '- [ ] [[タスクB]]',
        ]);
    });

    it('空配列なら空配列', () => {
        expect(groupRoutineLinesWithSections([])).toEqual([]);
    });
});
