import { describe, it, expect } from 'vitest';
import { TaskParser } from '../src/service/task-parser';

describe('TaskParser', () => {
    describe('parseLine', () => {
        it('完了タスクを正しく分解する', () => {
            const result = TaskParser.parseLine('- [x] 09:25 - 10:23 (58m) 起きた');
            expect(result.status).toBe('x');
            expect(result.times).toEqual(['09:25', '10:23']);
            expect(result.estimate).toBe('58m');
            expect(result.content).toBe('起きた');
        });

        it('進行中タスクを正しく分解する', () => {
            const result = TaskParser.parseLine('- [/] 10:22 - タスクシュート');
            expect(result.status).toBe('/');
            expect(result.times).toEqual(['10:22']);
            expect(result.content).toBe('タスクシュート');
        });

        it('未完了タスク（時刻なし）を正しく分解する', () => {
            const result = TaskParser.parseLine('- [ ] 読書 (30m)');
            expect(result.status).toBe(' ');
            expect(result.times).toEqual([]);
            expect(result.estimate).toBe('30m');
            expect(result.content).toBe('読書');
        });

        it('括弧なし見積り（末尾 15m）を正しく分解する', () => {
            const result = TaskParser.parseLine('- [ ] [[💪プッシュアップ]] 15m');
            expect(result.status).toBe(' ');
            expect(result.times).toEqual([]);
            expect(result.estimate).toBe('15m');
            expect(result.content).toBe('[[💪プッシュアップ]]');
        });

        it('未完了タスク（時刻あり）を正しく分解する', () => {
            const result = TaskParser.parseLine('- [ ] 11:00 - 12:00 ジム');
            expect(result.status).toBe(' ');
            expect(result.times).toEqual(['11:00', '12:00']);
            expect(result.content).toBe('ジム');
        });

        it('未完了タスク（単一時刻プレフィクス）を正しく分解する', () => {
            const result = TaskParser.parseLine('- [ ] 12:00 [[🥢昼ごはん]] (60m)');
            expect(result.status).toBe(' ');
            expect(result.times).toEqual(['12:00']);
            expect(result.estimate).toBe('60m');
            expect(result.content).toBe('[[🥢昼ごはん]]');
        });

        it('未完了タスクの先頭4桁を開始見込み時刻として分解する', () => {
            const result = TaskParser.parseLine('- [ ] 1800 ばんごはん 30m');
            expect(result.status).toBe(' ');
            expect(result.times).toEqual(['18:00']);
            expect(result.estimate).toBe('30m');
            expect(result.content).toBe('ばんごはん');
        });

        it('estimate > actual を含む完了行でも正しく解析する', () => {
            const result = TaskParser.parseLine('- [x] 09:00 - 09:30 (30m > 25m) 朝食');
            expect(result.estimate).toBe('30m > 25m');
            expect(result.content).toBe('朝食');
        });

        it('estimate → content の順でも正しく解析する', () => {
            const result = TaskParser.parseLine('- [x] 09:00 - 09:30 (30m) 朝食');
            expect(result.estimate).toBe('30m');
            expect(result.content).toBe('朝食');
        });

        it('plain 行を正しく分解する', () => {
            const result = TaskParser.parseLine('- メモ行');
            expect(result.status).toBe('plain');
            expect(result.content).toBe('メモ行');
        });
    });

    describe('serialize', () => {
        it('完了タスクを正しく合成する', () => {
            const result = TaskParser.serialize({
                status: 'x',
                times: ['09:25', '10:23'],
                estimate: '58m',
                content: '起きた',
            });
            expect(result).toBe('- [x] 09:25 - 10:23 (58m) 起きた');
        });

        it('進行中タスク（終了時刻なし）を正しく合成する', () => {
            const result = TaskParser.serialize({
                status: '/',
                times: ['10:22'],
                estimate: '',
                content: '図書館へ',
            });
            expect(result).toBe('- [/] 10:22 - 図書館へ');
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
