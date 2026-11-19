import { describe, expect, it } from 'vitest';
import { buildReflectionTimeline } from '../src/service/reflection-timeline';

// Accepted whole-day example, with personal prose omitted.
const note = `# 朝
- [x] 睡眠スクショ 09:11 - 10:21
- [x] リビング掃除 11:10 - 11:30
- [x] 仕事部屋掃除 14:16 - 14:38
- [ ] 朝の音楽 (60m)
- [ ] 寝室掃除 (5m)
- [ ] 振り返り (10m)
# 午前
- [x] 予定整備 10:21 - 10:27
- [x] BC執筆 10:27 - 10:42
- [x] レビュー 10:42 - 10:45
- [x] 執筆 10:45 - 10:46
- [x] ニュース 10:47 - 11:05
- [ ] 午前のdot
# 昼
- [x] スポンジ 14:22 - 14:22
- [x] 昼ごはん 12:20 - 14:16
- [/] 昼の皿洗い 14:18 - (15m)
# 午後
- [x] GC配信 11:11 - 12:20
- [ ] テーマ検討
- [ ] KS記事
- [ ] iPad記事
- [ ] 午後のdot
# 夕方
- [ ] スロージョギング (70m)
- [ ] レッグレイズ (20m)
- [ ] スクワット
- [ ] 夕方の音楽 (60m)
# 晩ごはん
- [ ] 17:50 晩ごはん (70m)
なにを作るか
- [ ] 家族会議 (30m)
- [ ] アピタ (47m)
- [ ] 夜の皿洗い (15m)
- [ ] 20:45 寝室への促し (15m)
# 夜
- [ ] 充電 (5m)
- [ ] 夜の音楽 (60m)
- [ ] お風呂 (30m)
# 深夜
- [ ] 睡眠 (480m)
- [ ] 対象外の本`;
const preview = {
    sections: [
        { value: 600, label: '朝' }, { value: 900, label: '午前' }, { value: 1100, label: '昼' },
        { value: 1330, label: '午後' }, { value: 1730, label: '夕方' }, { value: 1800, label: '晩ごはん' },
        { value: 2100, label: '夜' }, { value: 2359, label: '深夜' },
    ],
    isSleep: (line: string) => line === '- [ ] 睡眠 (480m)',
};

describe('accepted whole-day timeline', () => {
    it('selects the agreed representatives for every remaining hour', () => {
        const result = buildReflectionTimeline(note, 3, preview, 14 * 60 + 58);
        const titleAt = (hour: number) => result.tasks[result.hours[hour].representativeTaskId ?? -1]?.title;
        expect(Array.from({ length: 15 }, (_, index) => titleAt(index + 9))).toEqual([
            '睡眠スクショ', '睡眠スクショ', 'GC配信', '昼ごはん', '昼ごはん', '昼の皿洗い',
            'テーマ検討', 'KS記事', 'スロージョギング', '晩ごはん', 'アピタ', '家族会議', '夜の音楽', 'お風呂', '充電',
        ]);
        const details = (title: string) => result.blocks.find(block => block.title === title)!.tasks.map(task => task.title);
        expect(details('KS記事')).toEqual(['KS記事', 'iPad記事', '午後のdot']);
        expect(details('スロージョギング')).toEqual(['スロージョギング', 'レッグレイズ', 'スクワット', '夕方の音楽']);
        expect(details('家族会議')).toEqual(['家族会議', '夜の皿洗い', '寝室への促し']);
        expect(details('睡眠スクショ')).toEqual(expect.arrayContaining(['朝の音楽', '寝室掃除', '振り返り', '午前のdot']));
        expect(details('テーマ検討')).not.toContain('スロージョギング');
        const assigned = result.blocks.flatMap(block => block.tasks.map(task => task.id));
        expect(new Set(assigned).size).toBe(assigned.length);
        expect(assigned.sort()).toEqual(result.tasks.map(task => task.id).sort());
        expect(result.tasks.some(task => task.title === '対象外の本')).toBe(false);
    });
    it('promotes the next zero-estimate item after a candidate completes', () => {
        const updated = note.replace('- [ ] テーマ検討', '- [x] テーマ検討 15:00 - 15:30');
        const result = buildReflectionTimeline(updated, 3, preview, 15 * 60 + 31);
        expect(result.tasks[result.hours[16].representativeTaskId!].title).toBe('KS記事');
        expect(result.blocks.find(block => block.title === 'KS記事')!.tasks.map(task => task.title)).toEqual(['KS記事', 'iPad記事', '午後のdot']);
    });
});
