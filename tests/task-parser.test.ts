import { describe, expect, it } from 'vitest';
import { TaskParser } from '../src/service/task-parser';

describe('TaskParser', () => {
    describe('parseLine', () => {
        it('v2 完了タスクを planned / actual / duration に分解する', () => {
            const result = TaskParser.parseLine('- [x] 18:00 原稿修正 18:12 - 18:35 (30m > 23m)');
            expect(result.status).toBe('x');
            expect(result.plannedStart).toBe('18:00');
            expect(result.actualStart).toBe('18:12');
            expect(result.actualEnd).toBe('18:35');
            expect(result.estimate).toBe('30m');
            expect(result.actualDuration).toBe('23m');
            expect(result.content).toBe('原稿修正');
            expect(result.times).toEqual(['18:12', '18:35']);
        });

        it('v2 実行中タスクを本文保全しつつ分解する', () => {
            const result = TaskParser.parseLine('- [/] 18:00 原稿修正 18:12 - (30m)');
            expect(result.status).toBe('/');
            expect(result.body).toBe('18:00 原稿修正');
            expect(result.plannedStart).toBe('18:00');
            expect(result.actualStart).toBe('18:12');
            expect(result.actualEnd).toBe('');
            expect(result.estimate).toBe('30m');
            expect(result.content).toBe('原稿修正');
            expect(result.times).toEqual(['18:12']);
        });

        it('本文の後ろに開始時刻がある進行中タスクも分解できる', () => {
            const result = TaskParser.parseLine('- [/] ALPsでセミナー管理 21:49 -');
            expect(result.status).toBe('/');
            expect(result.body).toBe('ALPsでセミナー管理');
            expect(result.actualStart).toBe('21:49');
            expect(result.content).toBe('ALPsでセミナー管理');
            expect(result.times).toEqual(['21:49']);
        });

        it('未着手タスクは本文先頭 planned start を読む', () => {
            const result = TaskParser.parseLine('- [ ] 1800 ばんごはん 30m');
            expect(result.status).toBe(' ');
            expect(result.plannedStart).toBe('18:00');
            expect(result.estimate).toBe('30m');
            expect(result.content).toBe('ばんごはん');
            expect(result.times).toEqual(['18:00']);
        });

        it('末尾 marker だけを意味として扱う', () => {
            const result = TaskParser.parseLine('- [ ] 18:00 原稿修正 (30m) @done');
            expect(result.marker).toEqual({
                kind: 'atdone',
                raw: '@done',
                value: 'done',
                pending: true,
            });
            expect(result.content).toBe('原稿修正');
        });

        it('本文中の @ は marker として扱わない', () => {
            const result = TaskParser.parseLine('- [ ] 18:00 原稿修正 @done 追記 (30m)');
            expect(result.marker).toBeNull();
            expect(result.content).toBe('原稿修正 @done 追記');
        });

        it('未処理の日付 reschedule marker を読む', () => {
            const result = TaskParser.parseLine('- [ ] 原稿修正 @2026-04-10');
            expect(result.marker).toEqual({
                kind: 'reschedule',
                raw: '@2026-04-10',
                value: '2026-04-10',
                pending: true,
            });
            expect(result.content).toBe('原稿修正');
        });

        it('処理済み日付 marker を読む', () => {
            const result = TaskParser.parseLine('- [ ] 原稿修正 →2026-04-10');
            expect(result.marker).toEqual({
                kind: 'reschedule',
                raw: '→2026-04-10',
                value: '2026-04-10',
                pending: false,
            });
            expect(result.content).toBe('原稿修正');
        });

        it('plain 行を正しく分解する', () => {
            const result = TaskParser.parseLine('- メモ行');
            expect(result.status).toBe('plain');
            expect(result.content).toBe('メモ行');
        });
    });

    describe('serialize', () => {
        it('v2 完了タスクを正しく合成する', () => {
            const result = TaskParser.serialize({
                status: 'x',
                body: '18:00 原稿修正',
                content: '原稿修正',
                plannedStart: '18:00',
                actualStart: '18:12',
                actualEnd: '18:35',
                estimate: '30m',
                actualDuration: '23m',
                marker: null,
                times: ['18:12', '18:35'],
            });
            expect(result).toBe('- [x] 18:00 原稿修正 18:12 - 18:35 (30m > 23m)');
        });

        it('v2 実行中タスクを正しく合成する', () => {
            const result = TaskParser.serialize({
                status: '/',
                body: '18:00 図書館へ',
                content: '図書館へ',
                plannedStart: '18:00',
                actualStart: '18:12',
                actualEnd: '',
                estimate: '45m',
                actualDuration: '',
                marker: null,
                times: ['18:12'],
            });
            expect(result).toBe('- [/] 18:00 図書館へ 18:12 - (45m)');
        });
    });

    describe('normalizeTime', () => {
        it('4桁数字を HH:mm に変換する', () => {
            expect(TaskParser.normalizeTime('0900')).toBe('09:00');
            expect(TaskParser.normalizeTime('1430')).toBe('14:30');
        });

        it('3桁数字を HH:mm に変換する', () => {
            expect(TaskParser.normalizeTime('900')).toBe('09:00');
        });

        it('HH:mm はそのまま返す（ゼロ埋め）', () => {
            expect(TaskParser.normalizeTime('9:30')).toBe('09:30');
            expect(TaskParser.normalizeTime('14:05')).toBe('14:05');
        });
    });

    describe('normalizeLooseTimeToken', () => {
        it('normalizes 4-digit time', () => {
            expect(TaskParser.normalizeLooseTimeToken('0900')).toBe('09:00');
        });

        it('normalizes 3-digit time', () => {
            expect(TaskParser.normalizeLooseTimeToken('900')).toBe('09:00');
        });

        it('accepts HH:mm format with colon', () => {
            expect(TaskParser.normalizeLooseTimeToken('09:30')).toBe('09:30');
            expect(TaskParser.normalizeLooseTimeToken('9:05')).toBe('09:05');
        });

        it('returns null for out-of-range hours', () => {
            expect(TaskParser.normalizeLooseTimeToken('2500')).toBeNull();
        });

        it('returns null for out-of-range minutes', () => {
            expect(TaskParser.normalizeLooseTimeToken('1260')).toBeNull();
        });

        it('returns null for non-time strings', () => {
            expect(TaskParser.normalizeLooseTimeToken('abc')).toBeNull();
            expect(TaskParser.normalizeLooseTimeToken('12345')).toBeNull();
        });
    });

    describe('normalizeDurationToken', () => {
        it('normalizes bare minutes', () => {
            expect(TaskParser.normalizeDurationToken('30')).toBe('30m');
            expect(TaskParser.normalizeDurationToken('120')).toBe('120m');
        });

        it('normalizes m suffix', () => {
            expect(TaskParser.normalizeDurationToken('45m')).toBe('45m');
        });

        it('normalizes min suffix', () => {
            expect(TaskParser.normalizeDurationToken('60min')).toBe('60m');
        });

        it('converts h suffix to minutes', () => {
            expect(TaskParser.normalizeDurationToken('1.5h')).toBe('90m');
            expect(TaskParser.normalizeDurationToken('2h')).toBe('120m');
        });

        it('returns null for invalid input', () => {
            expect(TaskParser.normalizeDurationToken('abc')).toBeNull();
            expect(TaskParser.normalizeDurationToken('')).toBeNull();
        });

        it('returns null for 4+ digit bare numbers', () => {
            expect(TaskParser.normalizeDurationToken('1234')).toBeNull();
        });
    });

    describe('serialize edge cases', () => {
        it('serializes a plain status line', () => {
            const result = TaskParser.serialize({
                status: 'plain',
                body: 'メモ',
                content: 'メモ',
                plannedStart: '',
                actualStart: '',
                actualEnd: '',
                estimate: '',
                actualDuration: '',
                marker: null,
                times: [],
            });
            expect(result).toBe('- メモ');
        });

        it('serializes an unchecked task with only estimate', () => {
            const result = TaskParser.serialize({
                status: ' ',
                body: 'Review',
                content: 'Review',
                plannedStart: '',
                actualStart: '',
                actualEnd: '',
                estimate: '30m',
                actualDuration: '',
                marker: null,
                times: [],
            });
            expect(result).toBe('- [ ] Review (30m)');
        });

        it('serializes a completed task with actual-only duration', () => {
            const result = TaskParser.serialize({
                status: 'x',
                body: 'Task',
                content: 'Task',
                plannedStart: '',
                actualStart: '10:00',
                actualEnd: '10:30',
                estimate: '',
                actualDuration: '30m',
                marker: null,
                times: ['10:00', '10:30'],
            });
            expect(result).toBe('- [x] Task 10:00 - 10:30 (30m)');
        });

        it('includes marker in serialized output', () => {
            const result = TaskParser.serialize({
                status: ' ',
                body: 'Task',
                content: 'Task',
                plannedStart: '',
                actualStart: '',
                actualEnd: '',
                estimate: '30m',
                actualDuration: '',
                marker: { kind: 'atdone', raw: '@done', value: 'done', pending: true },
                times: [],
            });
            expect(result).toBe('- [ ] Task (30m) @done');
        });
    });

    describe('extractStatus: cancelled status', () => {
        it('treats [-] as plain because the regex only matches [ /x]', () => {
            const result = TaskParser.parseLine('- [-] Cancelled task');
            expect(result.status).toBe('plain');
            expect(result.content).toBe('[-] Cancelled task');
        });
    });

    describe('extractDurationFromTail: bare duration without parens', () => {
        it('parses bare duration at tail', () => {
            const result = TaskParser.parseLine('- [ ] Task 45m');
            expect(result.estimate).toBe('45m');
            expect(result.content).toBe('Task');
        });

        it('parses bare hour duration at tail', () => {
            const result = TaskParser.parseLine('- [ ] Task 1.5h');
            expect(result.estimate).toBe('90m');
            expect(result.content).toBe('Task');
        });
    });

    describe('extractMarkerFromTail: various formats', () => {
        it('parses full-width ＠done marker', () => {
            const result = TaskParser.parseLine('- [ ] Task ＠done');
            expect(result.marker).toEqual({
                kind: 'atdone',
                raw: '＠done',
                value: 'done',
                pending: true,
            });
        });

        it('parses processed →done marker', () => {
            const result = TaskParser.parseLine('- [ ] Task →done');
            expect(result.marker).toEqual({
                kind: 'atdone',
                raw: '→done',
                value: 'done',
                pending: false,
            });
        });

        it('parses MMDD compact reschedule marker', () => {
            const result = TaskParser.parseLine('- [ ] Task @0415');
            expect(result.marker).toEqual({
                kind: 'reschedule',
                raw: '@0415',
                value: '0415',
                pending: true,
            });
        });

        it('parses M/D reschedule marker', () => {
            const result = TaskParser.parseLine('- [ ] Task @4/15');
            expect(result.marker).toEqual({
                kind: 'reschedule',
                raw: '@4/15',
                value: '4/15',
                pending: true,
            });
        });

        it('parses 月日 reschedule marker', () => {
            const result = TaskParser.parseLine('- [ ] Task @4月15日');
            expect(result.marker).toEqual({
                kind: 'reschedule',
                raw: '@4月15日',
                value: '4月15日',
                pending: true,
            });
        });

        it('parses processed → reschedule marker', () => {
            const result = TaskParser.parseLine('- [ ] Task →2026-04-15');
            expect(result.marker).toEqual({
                kind: 'reschedule',
                raw: '→2026-04-15',
                value: '2026-04-15',
                pending: false,
            });
        });
    });

    describe('normalizeTime edge cases', () => {
        it('returns input as-is for single digit', () => {
            expect(TaskParser.normalizeTime('5')).toBe('5');
        });

        it('returns input as-is for 5+ digit strings', () => {
            expect(TaskParser.normalizeTime('12345')).toBe('12345');
        });
    });

    describe('extractPlannedStartFromBody edge cases', () => {
        it('body with only time token produces empty content', () => {
            const result = TaskParser.parseLine('- [ ] 1800');
            expect(result.plannedStart).toBe('18:00');
            expect(result.content).toBe('');
        });

        it('out-of-range time token is not treated as planned start', () => {
            const result = TaskParser.parseLine('- [ ] 2500 Task');
            expect(result.plannedStart).toBe('');
            expect(result.content).toBe('2500 Task');
        });
    });

    describe('parseLine → serialize round trip', () => {
        const roundTrips = [
            '- [x] 18:00 原稿修正 18:12 - 18:35 (30m > 23m)',
            '- [/] 18:00 原稿修正 18:12 - (30m)',
            '- [ ] 18:00 ばんごはん (30m)',
            '- [ ] Review PR (45m)',
            '- [x] Task 10:00 - 10:30 (30m)',
            '- [/] ALPsでセミナー管理 21:49 -',
        ];

        for (const line of roundTrips) {
            it(`round-trips: ${line}`, () => {
                const parsed = TaskParser.parseLine(line);
                expect(TaskParser.serialize(parsed)).toBe(line);
            });
        }
    });
});
