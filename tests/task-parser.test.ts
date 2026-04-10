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
});
