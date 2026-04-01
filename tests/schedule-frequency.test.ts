import { describe, expect, it } from 'vitest';
import {
    calculateNextDue,
    fromDateString,
    normalizeRepeatExpression,
    parseRepeatExpression,
    parseScheduleExpression,
    type Frequency,
    usesCompletionAnchor,
} from '../src/service/yaml-parser';

const d = (str: string) => fromDateString(str);

describe('schedule expression parsing', () => {
    it('normalizes repeat numeric shorthand', () => {
        expect(normalizeRepeatExpression(1)).toBe('every day');
        expect(normalizeRepeatExpression(10)).toBe('every 10 days');
        expect(normalizeRepeatExpression('1')).toBe('every day');
        expect(normalizeRepeatExpression('10')).toBe('every 10 days');
        expect(parseRepeatExpression(10)).toMatchObject({
            kind: 'interval_days',
            days: 10,
            anchor: 'due',
        });
    });

    it('normalizes weekly weekday shorthand in English and Japanese', () => {
        expect(normalizeRepeatExpression('sun mon')).toBe('every week on sun mon');
        expect(normalizeRepeatExpression('sun,mon')).toBe('every week on sun,mon');
        expect(normalizeRepeatExpression('sun:mon')).toBe('every week on sun,mon');
        expect(normalizeRepeatExpression('sun/mon')).toBe('every week on sun,mon');
        expect(normalizeRepeatExpression('日月火')).toBe('every week on 日月火');
        expect(normalizeRepeatExpression('月水金')).toBe('every week on 月水金');
        expect(normalizeRepeatExpression('日 月')).toBe('every week on 日 月');
        expect(normalizeRepeatExpression('日　月')).toBe('every week on 日 月');
        expect(normalizeRepeatExpression('日：月')).toBe('every week on 日,月');
        expect(normalizeRepeatExpression('日、月')).toBe('every week on 日,月');
        expect(normalizeRepeatExpression('日・月')).toBe('every week on 日,月');

        expect(parseRepeatExpression('sun mon')).toMatchObject({
            kind: 'weekly_days',
            interval: 1,
            days: [0, 1],
            anchor: 'due',
        });
        expect(parseRepeatExpression('sun,mon')).toMatchObject({
            kind: 'weekly_days',
            interval: 1,
            days: [0, 1],
            anchor: 'due',
        });
        expect(parseRepeatExpression('sun/mon')).toMatchObject({
            kind: 'weekly_days',
            interval: 1,
            days: [0, 1],
            anchor: 'due',
        });
        expect(parseRepeatExpression('日月火')).toMatchObject({
            kind: 'weekly_days',
            interval: 1,
            days: [0, 1, 2],
            anchor: 'due',
        });
        expect(parseRepeatExpression('月水金')).toMatchObject({
            kind: 'weekly_days',
            interval: 1,
            days: [1, 3, 5],
            anchor: 'due',
        });
        expect(parseRepeatExpression('日　月')).toMatchObject({
            kind: 'weekly_days',
            interval: 1,
            days: [0, 1],
            anchor: 'due',
        });
        expect(parseRepeatExpression('日・月')).toMatchObject({
            kind: 'weekly_days',
            interval: 1,
            days: [0, 1],
            anchor: 'due',
        });
    });

    it('normalizes Japanese completion-day shorthand with 後', () => {
        expect(normalizeRepeatExpression('5日後')).toBe('every 5 days from completion');
        expect(normalizeRepeatExpression('１日後')).toBe('every day from completion');

        expect(parseRepeatExpression('5日後')).toMatchObject({
            kind: 'interval_days',
            days: 5,
            anchor: 'completion',
        });
    });

    it('normalizes Japanese monthly day shorthand', () => {
        expect(normalizeRepeatExpression('毎月1日')).toBe('every month on day 1');
        expect(normalizeRepeatExpression('毎月15日')).toBe('every month on day 15');
        expect(normalizeRepeatExpression('毎月5,10,15日')).toBe('every month on days 5,10,15');
        expect(normalizeRepeatExpression('毎月5、10、15日')).toBe('every month on days 5,10,15');
        expect(normalizeRepeatExpression('毎月５、１０、１５日')).toBe('every month on days 5,10,15');
        expect(normalizeRepeatExpression('毎月末')).toBe('every month on last day');
        expect(normalizeRepeatExpression('毎月末-1日')).toBe('every month on last day -1');

        expect(parseRepeatExpression('毎月1日')).toMatchObject({
            kind: 'monthly_days',
            interval: 1,
            dates: [1],
            anchor: 'due',
        });
        expect(parseRepeatExpression('毎月5,10,15日')).toMatchObject({
            kind: 'monthly_days',
            interval: 1,
            dates: [5, 10, 15],
            anchor: 'due',
        });
        expect(parseRepeatExpression('毎月末-1日')).toMatchObject({
            kind: 'monthly_days',
            interval: 1,
            dates: [-2],
            anchor: 'due',
        });
    });

    it('normalizes Japanese weekly natural shorthand', () => {
        expect(normalizeRepeatExpression('毎週月曜')).toBe('every week on 月');
        expect(normalizeRepeatExpression('毎週月曜日')).toBe('every week on 月');
        expect(normalizeRepeatExpression('毎週月水金')).toBe('every week on 月水金');
        expect(normalizeRepeatExpression('毎週月・水・金')).toBe('every week on 月・水・金');
        expect(normalizeRepeatExpression('隔週月曜')).toBe('every 2 weeks on 月');
        expect(normalizeRepeatExpression('隔週月水金')).toBe('every 2 weeks on 月水金');

        expect(parseRepeatExpression('毎週月曜')).toMatchObject({
            kind: 'weekly_days',
            interval: 1,
            days: [1],
            anchor: 'due',
        });
        expect(parseRepeatExpression('隔週月曜')).toMatchObject({
            kind: 'weekly_days',
            interval: 2,
            days: [1],
            anchor: 'due',
        });
        expect(parseRepeatExpression('毎週月水金')).toMatchObject({
            kind: 'weekly_days',
            interval: 1,
            days: [1, 3, 5],
            anchor: 'due',
        });
        expect(parseRepeatExpression('毎週月・水・金')).toMatchObject({
            kind: 'weekly_days',
            interval: 1,
            days: [1, 3, 5],
            anchor: 'due',
        });
    });

    it('normalizes Japanese monthly nth weekday shorthand including last', () => {
        expect(normalizeRepeatExpression('第2土曜日')).toBe('every month on 2nd sat');
        expect(normalizeRepeatExpression('第１土曜日')).toBe('every month on 1st sat');
        expect(normalizeRepeatExpression('第一土曜日')).toBe('every month on 1st sat');
        expect(normalizeRepeatExpression('第2,3日曜日')).toBe('every month on 2nd sun,3rd sun');
        expect(normalizeRepeatExpression('第２、３日曜日')).toBe('every month on 2nd sun,3rd sun');
        expect(normalizeRepeatExpression('最終土曜日')).toBe('every month on last sat');

        expect(parseRepeatExpression('第一土曜日')).toMatchObject({
            kind: 'monthly_nth_weekday',
            interval: 1,
            instance: 1,
            day: 6,
            anchor: 'due',
        });
        expect(parseRepeatExpression('第2,3日曜日')).toMatchObject({
            kind: 'monthly_nth_weekdays',
            interval: 1,
            anchor: 'due',
        });
        expect(parseRepeatExpression('最終土曜日')).toMatchObject({
            kind: 'monthly_nth_weekday',
            interval: 1,
            instance: -1,
            day: 6,
            anchor: 'due',
        });
    });

    it('parses monthly last day offsets', () => {
        expect(parseScheduleExpression('every month on last day')).toMatchObject({
            kind: 'monthly_days',
            interval: 1,
            dates: [-1],
            anchor: 'due',
        });
        expect(parseScheduleExpression('every month on last day -1')).toMatchObject({
            kind: 'monthly_days',
            interval: 1,
            dates: [-2],
            anchor: 'due',
        });
    });

    it('defaults to due anchor and accepts explicit from completion', () => {
        expect(parseScheduleExpression('every 7 days')).toMatchObject({
            kind: 'interval_days',
            days: 7,
            anchor: 'due',
        });
        expect(parseScheduleExpression('every 7 days from due')).toMatchObject({
            kind: 'interval_days',
            days: 7,
            anchor: 'due',
        });
        expect(parseScheduleExpression('every 7 days from completion')).toMatchObject({
            kind: 'interval_days',
            days: 7,
            anchor: 'completion',
        });
    });

    it('accepts singular unit even when interval > 1', () => {
        expect(parseScheduleExpression('every 2 day')).toMatchObject({
            kind: 'interval_days',
            days: 2,
        });
        expect(parseScheduleExpression('every 2 week')).toMatchObject({
            kind: 'interval_days',
            days: 14,
        });
        expect(parseScheduleExpression('every 2 month')).toMatchObject({
            kind: 'interval_months',
            months: 2,
        });
    });

    it('parses Japanese weekday formats with and without commas', () => {
        expect(parseScheduleExpression('every week on 月,水,金')).toMatchObject({
            kind: 'weekly_days',
            interval: 1,
            days: [1, 3, 5],
        });
        expect(parseScheduleExpression('every week on 月水金')).toMatchObject({
            kind: 'weekly_days',
            interval: 1,
            days: [1, 3, 5],
        });
        expect(parseScheduleExpression('every week on 火曜日 木曜日')).toMatchObject({
            kind: 'weekly_days',
            interval: 1,
            days: [2, 4],
        });
    });

    it('parses Japanese and compact yearly date formats', () => {
        expect(parseScheduleExpression('every year on 12月31日')).toMatchObject({
            kind: 'yearly_dates',
            dates: [{ month: 12, day: 31 }],
        });
        expect(parseScheduleExpression('every year on 1231')).toMatchObject({
            kind: 'yearly_dates',
            dates: [{ month: 12, day: 31 }],
        });
        expect(parseScheduleExpression('every year on 1月 last day')).toMatchObject({
            kind: 'yearly_month_last_day',
            month: 1,
            offset: 0,
        });
    });
});

describe('schedule expression due date calculation', () => {
    it('supports daily/weekday/weekend patterns', () => {
        expect(calculateNextDue(schedule('every day'), d('2026-02-20'))).toBe('2026-02-21');
        expect(calculateNextDue(schedule('every weekday'), d('2026-02-20'))).toBe('2026-02-23');
        expect(calculateNextDue(schedule('every weekend day'), d('2026-02-20'))).toBe('2026-02-21');
        expect(calculateNextDue(schedule('every 2 day'), d('2026-02-20'))).toBe('2026-02-22');
    });

    it('supports weekly patterns', () => {
        expect(calculateNextDue(schedule('every week'), d('2026-02-20'))).toBe('2026-02-27');
        expect(calculateNextDue(schedule('every week on mon,wed,fri'), d('2026-02-20'))).toBe('2026-02-23');
        expect(calculateNextDue(schedule('every 2 weeks on fri'), d('2026-02-20'))).toBe('2026-03-06');
        expect(calculateNextDue(schedule('every 2 week'), d('2026-02-20'))).toBe('2026-03-06');
    });

    it('supports weekly patterns written in Japanese and unordered weekdays', () => {
        expect(calculateNextDue(schedule('every week on 月水金'), d('2026-02-20'))).toBe('2026-02-23');
        expect(calculateNextDue(schedule('every week on 金,月,水'), d('2026-02-20'))).toBe('2026-02-23');
    });

    it('supports monthly fixed-day patterns', () => {
        expect(calculateNextDue(schedule('every month'), d('2026-01-31'))).toBe('2026-02-28');
        expect(calculateNextDue(schedule('every month on day 1'), d('2026-02-20'))).toBe('2026-03-01');
        expect(calculateNextDue(schedule('every month on days 5,20'), d('2026-02-20'))).toBe('2026-03-05');
        expect(calculateNextDue(schedule('every month on days 1..3'), d('2026-02-20'))).toBe('2026-03-01');
        expect(calculateNextDue(schedule('every month on last day'), d('2026-02-20'))).toBe('2026-02-28');
        expect(calculateNextDue(schedule('every month on last day -1'), d('2026-02-20'))).toBe('2026-02-27');
        expect(calculateNextDue(schedule('every 2 months on day 1'), d('2026-02-20'))).toBe('2026-04-01');
    });

    it('supports monthly nth weekday patterns', () => {
        expect(calculateNextDue(schedule('every month on 2nd sat'), d('2026-02-20'))).toBe('2026-03-14');
        expect(calculateNextDue(schedule('every month on last fri'), d('2026-02-20'))).toBe('2026-02-27');
        expect(calculateNextDue(schedule('every month on 1st mon'), d('2026-02-20'))).toBe('2026-03-02');
    });

    it('supports yearly patterns', () => {
        expect(calculateNextDue(schedule('every year'), d('2026-02-20'))).toBe('2027-02-20');
        expect(calculateNextDue(schedule('every year on 12-25'), d('2026-02-20'))).toBe('2026-12-25');
        expect(calculateNextDue(schedule('every year on 06-30,12-31'), d('2026-02-20'))).toBe('2026-06-30');
        expect(calculateNextDue(schedule('every year on feb last day'), d('2026-02-20'))).toBe('2026-02-28');
        expect(calculateNextDue(schedule('every year on mar last day -1'), d('2026-02-20'))).toBe('2026-03-30');
        expect(calculateNextDue(schedule('every 4 years on 02-29'), d('2024-02-29'))).toBe('2028-02-29');
        expect(calculateNextDue(schedule('every year on 12月31日'), d('2026-02-20'))).toBe('2026-12-31');
        expect(calculateNextDue(schedule('every year on 1231'), d('2026-02-20'))).toBe('2026-12-31');
        expect(calculateNextDue(schedule('every year on 2月 last day'), d('2026-02-20'))).toBe('2026-02-28');
    });
});

describe('completion anchor detection', () => {
    it('detects completion anchor only when explicitly specified', () => {
        expect(usesCompletionAnchor(schedule('every 7 days from completion'))).toBe(true);
        expect(usesCompletionAnchor(schedule('every 7 days'))).toBe(false);
        expect(usesCompletionAnchor(schedule('every 7 days from due'))).toBe(false);
    });
});

function schedule(expression: string): Frequency {
    return { type: 'schedule', expression };
}
