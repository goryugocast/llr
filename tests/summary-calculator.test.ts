import { describe, it, expect } from 'vitest';
import { buildSummaryPresentation, computeSummaryData } from '../src/service/summary-calculator';
import { calculateDuration } from '../src/service/time-calculator';

describe('computeSummaryData', () => {
    it('完了済みのタスクはファイル内の時刻を維持する', () => {
        const lines = [
            '- [x] 完了済みタスク 09:00 - 09:30 (30m)'
        ];
        const nowTime = '10:00';
        const data = computeSummaryData(lines, nowTime, calculateDuration);

        expect(data.items[0].displayStartTime).toBe('09:00');
        expect(data.items[0].displayEndTime).toBe('09:30');
        expect(data.items[0].isProjected).toBe(false);
    });

    it('実行中のタスクは開始時刻を維持し、見積に基づいて終了予定を計算する', () => {
        const lines = [
            '- [/] 実行中タスク 10:00 - (30m)'
        ];
        const nowTime = '10:15';
        const data = computeSummaryData(lines, nowTime, calculateDuration);

        expect(data.items[0].displayStartTime).toBe('10:00');
        expect(data.items[0].displayEndTime).toBe('10:30');
        expect(data.items[0].isProjected).toBe(true);
    });

    it('未開始タスクは完了済みではなく現在の計画アンカーから開始される', () => {
        const lines = [
            '- [x] 完了済み 09:00 - 09:30 (30m)',
            '- [ ] 未開始1 (30m)',
            '- [ ] 未開始2 (15m)'
        ];
        const nowTime = '09:45';
        const data = computeSummaryData(lines, nowTime, calculateDuration);

        expect(data.items[1].displayStartTime).toBe('09:45');
        expect(data.items[1].displayEndTime).toBe('10:15');

        expect(data.items[2].displayStartTime).toBe(data.items[1].displayEndTime);
        expect(data.items[2].displayEndTime).toBe('10:30');
    });

    it('実行中タスクが見積を超過した場合、次のタスクは現在時刻から開始される', () => {
        const lines = [
            '- [/] 超過タスク 09:00 - (30m)',
            '- [ ] 次のタスク (15m)'
        ];
        const nowTime = '10:00'; // すでに見積の09:30を過ぎている
        const data = computeSummaryData(lines, nowTime, calculateDuration);

        expect(data.items[0].displayEndTime).toBe('10:00'); // 計画軸では現在時刻まで伸びる
        expect(data.items[1].displayStartTime).toBe('10:00'); // 現在時刻から開始
        expect(data.items[1].displayEndTime).toBe('10:15');
    });

    it('見積がない未開始タスクは現在の計画アンカー時刻を維持する', () => {
        const lines = [
            '- [x] 完了済み 09:00 - 09:30',
            '- [ ] 未開始'
        ];
        const nowTime = '09:45';
        const data = computeSummaryData(lines, nowTime, calculateDuration);

        expect(data.items[1].displayStartTime).toBe('09:45');
        expect(data.items[1].displayEndTime).toBe('09:45');
    });

    it('見積なしの実行中タスクは終了表示を現在時刻にし、後続タスクもそこから積み上げる', () => {
        const lines = [
            '- [/] 実行中（見積なし） 10:00 -',
            '- [ ] 次のタスク (15m)'
        ];
        const nowTime = '10:40';
        const data = computeSummaryData(lines, nowTime, calculateDuration);

        expect(data.items[0].displayStartTime).toBe('10:00');
        expect(data.items[0].displayEndTime).toBe('10:40');
        expect(data.items[1].displayStartTime).toBe('10:40');
        expect(data.items[1].displayEndTime).toBe('10:55');
    });

    it('チェックボックスのない skip ログ行は集計しない', () => {
        const lines = [
            '- skip: [[朝のルーチン]]',
            '- [ ] 次のタスク (15m)',
        ];
        const nowTime = '10:00';
        const data = computeSummaryData(lines, nowTime, calculateDuration);

        expect(data.items).toHaveLength(1);
        expect(data.items[0].displayText).toBe('次のタスク');
        expect(data.header.total).toBe('0h15m');
        expect(data.header.end).toBe('10:15');
    });

    it('表示後はステータスではなく表示開始時刻順に並ぶ', () => {
        const lines = [
            '- [ ] 未開始 (15m)',
            '- [x] 朝の完了 09:00 - 09:30 (30m)',
            '- [/] 実行中 10:00 - (20m)',
        ];
        const nowTime = '10:05';
        const data = computeSummaryData(lines, nowTime, calculateDuration);

        expect(data.items.map((item) => item.displayText)).toEqual([
            '朝の完了',
            '実行中',
            '未開始',
        ]);
        expect(data.items.map((item) => item.displayStartTime)).toEqual([
            '09:00',
            '10:00',
            '10:20',
        ]);
    });

    it('24時をまたいだ表示時刻は翌日扱いで末尾側に並ぶ', () => {
        const lines = [
            '- [x] 夜の完了 23:40 - 23:55 (15m)',
            '- [/] 進行中 23:55 - (20m)',
            '- [ ] 深夜タスク (30m)',
        ];
        const nowTime = '23:58';
        const data = computeSummaryData(lines, nowTime, calculateDuration);

        expect(data.items.map((item) => item.displayStartTime)).toEqual([
            '23:40',
            '23:55',
            '00:15',
        ]);
        expect(data.items.map((item) => item.displayText)).toEqual([
            '夜の完了',
            '進行中',
            '深夜タスク',
        ]);
    });

    it('完了済みタスクも日付境界前の時刻を末尾側として並べる', () => {
        const lines = [
            '- [x] 夜の完了 23:40 - 23:55 (15m)',
            '- [x] sleep 00:30 - 06:30 (6h)',
            '- [x] 朝の支度 08:00 - 08:15 (15m)',
        ];
        const nowTime = '08:30';
        const data = computeSummaryData(lines, nowTime, calculateDuration);

        expect(data.items.map((item) => item.displayText)).toEqual([
            '朝の支度',
            '夜の完了',
            'sleep',
        ]);
        expect(data.items.map((item) => item.displayStartTime)).toEqual([
            '08:00',
            '23:40',
            '00:30',
        ]);
    });

    it('presentationでは過去と未来を分け、sleepより下の未完は隠す', () => {
        const lines = [
            '- [ ] 取り残し (10m)',
            '- [/] 実行中 20:00 - (20m)',
            '- [ ] これから (15m)',
            '- [ ] sleep (30m)',
            '- [ ] 後回し (5m)',
        ];
        const nowTime = '20:00';
        const data = computeSummaryData(lines, nowTime, calculateDuration);
        const presentation = buildSummaryPresentation(data, {
            nowTime,
            isSleepItem: (item) => item.displayText === 'sleep',
            resolveSectionLabel: () => '夜',
            resolveWarningRatio: (item) => item.displayText === 'これから' ? 0.4 : 0,
        });

        expect(presentation.pastGroups).toHaveLength(0);
        expect(presentation.futureGroups).toHaveLength(1);
        expect(presentation.futureGroups[0].sectionLabel).toBe('夜');
        expect(presentation.futureGroups[0].items.map((item) => item.displayText)).toEqual([
            '実行中',
            '取り残し',
            'これから',
            'sleep',
        ]);
        expect(presentation.futureGroups[0].items.map((item) => item.displayStartTime)).toEqual([
            '20:00',
            '20:20',
            '20:30',
            '20:45',
        ]);
        expect(presentation.futureGroups[0].warningRatio).toBe(0.4);
        expect(presentation.hiddenItems.map((item) => item.displayText)).toEqual(['後回し']);
        expect(presentation.header.total).toBe('0h45m');
        expect(presentation.header.end).toBe('20:45');
        expect(presentation.header.wake).toBe('21:15');
    });

    it('完了済みsleepがある日は未完タスク全体を未来計算から外す', () => {
        const lines = [
            '- [ ] 寝る前の片付け (15m)',
            '- [x] お酒 22:30 - 00:27 (117m)',
            '- [x] sleep 00:27 - 11:03 (480m)',
            '- [ ] トイレのブラーバ (5m)',
            '- [ ] review (60m)',
            '- [ ] Analyticsからの改善 (15m)',
        ];
        const nowTime = '15:11';
        const data = computeSummaryData(lines, nowTime, calculateDuration);
        const presentation = buildSummaryPresentation(data, {
            nowTime,
            isSleepItem: (item) => item.displayText === 'sleep',
            resolveSectionLabel: () => null,
            resolveWarningRatio: () => 0,
        });

        expect(presentation.pastGroups.flatMap((group) => group.items).map((item) => item.displayText)).toEqual([
            'お酒',
            'sleep',
        ]);
        expect(presentation.futureGroups).toHaveLength(0);
        expect(presentation.hiddenItems.map((item) => item.displayText)).toEqual([
            '寝る前の片付け',
            'トイレのブラーバ',
            'review',
            'Analyticsからの改善',
        ]);
        expect(presentation.header.total).toBe('-');
        expect(presentation.header.end).toBe(data.header.end);
    });
});
