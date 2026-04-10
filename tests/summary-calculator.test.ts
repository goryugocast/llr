import { describe, expect, it } from 'vitest';
import { buildSummaryPresentation, computeSummaryData } from '../src/service/summary-calculator';
import { calculateDuration } from '../src/service/time-calculator';

describe('computeSummaryData (v2)', () => {
    it('完了済みタスクは actual range をそのまま表示する', () => {
        const lines = [
            '- [x] 09:00 完了済みタスク 09:25 - 09:30 (5m)',
        ];
        const data = computeSummaryData(lines, '10:00', calculateDuration);

        expect(data.items[0].displayStartTime).toBe('09:25');
        expect(data.items[0].displayEndTime).toBe('09:30');
        expect(data.items[0].displayText).toBe('完了済みタスク');
        expect(data.items[0].isProjected).toBe(false);
    });

    it('実行中タスクは actual start を維持し、estimate で終了予定を積む', () => {
        const lines = [
            '- [/] 10:00 実行中タスク 10:00 - (30m)',
        ];
        const data = computeSummaryData(lines, '10:15', calculateDuration);

        expect(data.items[0].displayStartTime).toBe('10:00');
        expect(data.items[0].displayEndTime).toBe('10:30');
        expect(data.items[0].isProjected).toBe(true);
    });

    it('未開始タスクは現在の計画アンカーから積み上げる', () => {
        const lines = [
            '- [x] 朝の完了 09:00 - 09:30 (30m)',
            '- [ ] 未開始1 (30m)',
            '- [ ] 未開始2 (15m)',
        ];
        const data = computeSummaryData(lines, '09:45', calculateDuration);

        expect(data.items[1].displayStartTime).toBe('09:45');
        expect(data.items[1].displayEndTime).toBe('10:15');
        expect(data.items[2].displayStartTime).toBe('10:15');
        expect(data.items[2].displayEndTime).toBe('10:30');
    });

    it('planned start は reserved tail 用に保持しつつ、表示開始は計画アンカーに従う', () => {
        const lines = [
            '- [ ] 18:00 原稿修正 (30m)',
        ];
        const data = computeSummaryData(lines, '19:00', calculateDuration);

        expect(data.items[0].plannedStart).toBe('18:00');
        expect(data.items[0].displayStartTime).toBe('19:00');
        expect(data.items[0].displayEndTime).toBe('19:30');
        expect(data.items[0].displayText).toBe('原稿修正');
    });

    it('presentation では sleep より下の未完を隠す', () => {
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

        expect(presentation.futureGroups).toHaveLength(1);
        expect(presentation.futureGroups[0].items.map((item) => item.displayText)).toEqual([
            '実行中',
            '取り残し',
            'これから',
            'sleep',
        ]);
        expect(presentation.hiddenItems.map((item) => item.displayText)).toEqual(['後回し']);
        expect(presentation.header.total).toBe('0h45m');
        expect(presentation.header.end).toBe('20:45');
        expect(presentation.header.wake).toBe('21:15');
    });
});
