import { describe, it, expect } from 'vitest';
import {
    sortSrsCandidatesByOverdue,
    isSrsBatchAllComplete,
    collectLinkedBasenames,
    formatSrsTaskLine,
    buildSrsBatchBlock,
    SRS_BATCH_START,
    SRS_BATCH_END,
    SRS_BATCH_DONE,
} from '../src/service/srs-batch';

describe('sortSrsCandidatesByOverdue', () => {
    it('overdue な候補が today 当日の候補より先に来る', () => {
        const candidates = [
            { basename: '今日', next_due: '2026-07-06' },
            { basename: '3日前', next_due: '2026-07-03' },
            { basename: '1週間前', next_due: '2026-06-29' },
        ];

        const sorted = sortSrsCandidatesByOverdue(candidates, '2026-07-06');

        expect(sorted[0].basename).toBe('1週間前');
        expect(sorted[1].basename).toBe('3日前');
        expect(sorted[2].basename).toBe('今日');
    });

    it('overdue 同士は next_due が古い順', () => {
        const candidates = [
            { basename: 'B', next_due: '2026-07-01' },
            { basename: 'A', next_due: '2026-06-20' },
            { basename: 'C', next_due: '2026-07-04' },
        ];

        const sorted = sortSrsCandidatesByOverdue(candidates, '2026-07-06');

        expect(sorted[0].basename).toBe('A');
        expect(sorted[1].basename).toBe('B');
        expect(sorted[2].basename).toBe('C');
    });

    it('未来の due は overdue の後ろに来る', () => {
        const candidates = [
            { basename: '未来', next_due: '2026-07-10' },
            { basename: '過去', next_due: '2026-07-01' },
        ];

        const sorted = sortSrsCandidatesByOverdue(candidates, '2026-07-06');

        expect(sorted[0].basename).toBe('過去');
        expect(sorted[1].basename).toBe('未来');
    });

    it('next_due がない候補は最優先（一度も出ていないノート）', () => {
        const candidates = [
            { basename: '過去', next_due: '2026-07-01' },
            { basename: 'なし' },
            { basename: '未来', next_due: '2026-07-10' },
        ];

        const sorted = sortSrsCandidatesByOverdue(candidates, '2026-07-06');

        expect(sorted[0].basename).toBe('なし');
        expect(sorted[1].basename).toBe('過去');
        expect(sorted[2].basename).toBe('未来');
    });

    it('next_due なしが複数あっても overdue より先に来る', () => {
        const candidates = [
            { basename: '過去', next_due: '2026-06-20' },
            { basename: 'なしA' },
            { basename: 'なしB' },
        ];

        const sorted = sortSrsCandidatesByOverdue(candidates, '2026-07-06');

        expect(sorted[0].basename).toBe('なしA');
        expect(sorted[1].basename).toBe('なしB');
        expect(sorted[2].basename).toBe('過去');
    });

    it('全部が同じ日なら順序は安定する', () => {
        const candidates = [
            { basename: 'A', next_due: '2026-07-06' },
            { basename: 'B', next_due: '2026-07-06' },
        ];

        const sorted = sortSrsCandidatesByOverdue(candidates, '2026-07-06');
        expect(sorted).toHaveLength(2);
    });

    it('空配列を渡しても壊れない', () => {
        expect(sortSrsCandidatesByOverdue([], '2026-07-06')).toEqual([]);
    });
});

describe('isSrsBatchAllComplete', () => {
    it('全タスクが完了なら true', () => {
        const content = [
            '- [x] [[A]]',
            SRS_BATCH_START,
            '- [x] [[B]]',
            '- [x] [[C]]',
            SRS_BATCH_END,
        ].join('\n');

        expect(isSrsBatchAllComplete(content)).toBe(true);
    });

    it('未完了が1つでもあれば false', () => {
        const content = [
            SRS_BATCH_START,
            '- [x] [[A]]',
            '- [ ] [[B]]',
            SRS_BATCH_END,
        ].join('\n');

        expect(isSrsBatchAllComplete(content)).toBe(false);
    });

    it('バッチマーカーがなければ false', () => {
        expect(isSrsBatchAllComplete('- [x] [[A]]')).toBe(false);
    });

    it('バッチ区間にタスク行がなければ false', () => {
        const content = [
            SRS_BATCH_START,
            '',
            SRS_BATCH_END,
        ].join('\n');

        expect(isSrsBatchAllComplete(content)).toBe(false);
    });

    it('進行中（/）のタスクは未完了扱い', () => {
        const content = [
            SRS_BATCH_START,
            '- [/] [[A]]',
            SRS_BATCH_END,
        ].join('\n');

        expect(isSrsBatchAllComplete(content)).toBe(false);
    });

    it('区間内にメモ行があってもチェックボックスだけで判定する', () => {
        const content = [
            SRS_BATCH_START,
            '- [x] [[A]] 17:00 - 17:05 (5m)',
            'これ面白かった',
            '',
            '- [x] [[B]] 17:05 - 17:10 (5m)',
            SRS_BATCH_END,
        ].join('\n');

        expect(isSrsBatchAllComplete(content)).toBe(true);
    });

    it('メモ行があっても未完了チェックボックスがあれば false', () => {
        const content = [
            SRS_BATCH_START,
            '- [x] [[A]]',
            'メモ',
            '- [ ] [[B]]',
            SRS_BATCH_END,
        ].join('\n');

        expect(isSrsBatchAllComplete(content)).toBe(false);
    });

    it('チェックボックスでない箇条書きは判定に含めない', () => {
        const content = [
            SRS_BATCH_START,
            '- [x] [[A]]',
            '- 普通のリスト項目',
            '- [x] [[B]]',
            SRS_BATCH_END,
        ].join('\n');

        expect(isSrsBatchAllComplete(content)).toBe(true);
    });
});

describe('collectLinkedBasenames', () => {
    it('wikilink のリンク先を収集する', () => {
        const content = '- [x] [[ノートA]]\n- [ ] [[ノートB]]\nテキスト [[ノートC]]';
        const result = collectLinkedBasenames(content);

        expect(result.has('ノートA')).toBe(true);
        expect(result.has('ノートB')).toBe(true);
        expect(result.has('ノートC')).toBe(true);
        expect(result.size).toBe(3);
    });

    it('重複するリンクは1つにまとまる', () => {
        const content = '[[A]] [[A]] [[B]]';
        const result = collectLinkedBasenames(content);
        expect(result.size).toBe(2);
    });

    it('リンクがなければ空の Set', () => {
        expect(collectLinkedBasenames('何もない')).toEqual(new Set());
    });
});

describe('formatSrsTaskLine', () => {
    it('basename だけの場合', () => {
        expect(formatSrsTaskLine({ basename: 'テスト' })).toBe('- [ ] [[テスト]]');
    });

    it('start と estimate がある場合', () => {
        expect(formatSrsTaskLine({ basename: 'テスト', start: 900, estimate: 15 }))
            .toBe('- [ ] 09:00 [[テスト]] (15m)');
    });

    it('estimate だけの場合', () => {
        expect(formatSrsTaskLine({ basename: 'テスト', estimate: 30 }))
            .toBe('- [ ] [[テスト]] (30m)');
    });
});

describe('buildSrsBatchBlock', () => {
    it('マーカーで囲まれたブロックを生成する', () => {
        const candidates = [
            { basename: 'A' },
            { basename: 'B' },
        ];

        const lines = buildSrsBatchBlock(candidates);

        expect(lines[0]).toBe(SRS_BATCH_START);
        expect(lines[1]).toBe('- [ ] [[A]]');
        expect(lines[2]).toBe('- [ ] [[B]]');
        expect(lines[lines.length - 1]).toBe(SRS_BATCH_END);
    });

    it('空配列でもマーカーは出る', () => {
        const lines = buildSrsBatchBlock([]);
        expect(lines).toEqual([SRS_BATCH_START, SRS_BATCH_END]);
    });
});

describe('SRS バッチ補充の統合シナリオ', () => {
    it('全完了 → 残り候補からバッチサイズ分を選べる', () => {
        const content = [
            '- [x] [[ルーチンA]]',
            SRS_BATCH_START,
            '- [x] [[SRS_1]]',
            '- [x] [[SRS_2]]',
            '- [x] [[SRS_3]]',
            SRS_BATCH_END,
        ].join('\n');

        expect(isSrsBatchAllComplete(content)).toBe(true);

        const alreadyLinked = collectLinkedBasenames(content);
        expect(alreadyLinked.has('SRS_1')).toBe(true);

        const allCandidates = [
            { basename: 'SRS_1', next_due: '2026-07-01' },
            { basename: 'SRS_4', next_due: '2026-06-25' },
            { basename: 'SRS_5', next_due: '2026-07-03' },
            { basename: 'SRS_6', next_due: '2026-07-10' },
        ];

        const fresh = allCandidates.filter(c => !alreadyLinked.has(c.basename));
        const sorted = sortSrsCandidatesByOverdue(fresh, '2026-07-06');
        const batch = sorted.slice(0, 3);

        expect(batch[0].basename).toBe('SRS_4');
        expect(batch[1].basename).toBe('SRS_5');
        expect(batch[2].basename).toBe('SRS_6');
    });

    it('候補がバッチサイズ未満なら全部出す', () => {
        const alreadyLinked = new Set(['SRS_1', 'SRS_2', 'SRS_3']);
        const allCandidates = [
            { basename: 'SRS_1', next_due: '2026-07-01' },
            { basename: 'SRS_4', next_due: '2026-07-02' },
        ];

        const fresh = allCandidates.filter(c => !alreadyLinked.has(c.basename));
        const sorted = sortSrsCandidatesByOverdue(fresh, '2026-07-06');
        const batch = sorted.slice(0, 3);

        expect(batch).toHaveLength(1);
        expect(batch[0].basename).toBe('SRS_4');
    });

    it('next_due なしの候補が overdue より先に選ばれる', () => {
        const alreadyLinked = new Set(['SRS_1']);
        const allCandidates = [
            { basename: 'SRS_1', next_due: '2026-07-01' },
            { basename: 'SRS_新規' },
            { basename: 'SRS_古い', next_due: '2026-06-20' },
            { basename: 'SRS_最近', next_due: '2026-07-05' },
        ];

        const fresh = allCandidates.filter(c => !alreadyLinked.has(c.basename));
        const sorted = sortSrsCandidatesByOverdue(fresh, '2026-07-06');
        const batch = sorted.slice(0, 3);

        expect(batch[0].basename).toBe('SRS_新規');
        expect(batch[1].basename).toBe('SRS_古い');
        expect(batch[2].basename).toBe('SRS_最近');
    });

    it('未完了があれば補充しない', () => {
        const content = [
            SRS_BATCH_START,
            '- [x] [[A]]',
            '- [ ] [[B]]',
            SRS_BATCH_END,
        ].join('\n');

        expect(isSrsBatchAllComplete(content)).toBe(false);
    });

    it('全完了で候補なし → done マーカーに書き換わるべき状態', () => {
        const content = [
            SRS_BATCH_START,
            '- [x] [[SRS_1]]',
            '- [x] [[SRS_2]]',
            SRS_BATCH_END,
        ].join('\n');

        expect(isSrsBatchAllComplete(content)).toBe(true);

        const alreadyLinked = collectLinkedBasenames(content);
        const allCandidates = [
            { basename: 'SRS_1', next_due: '2026-07-01' },
            { basename: 'SRS_2', next_due: '2026-07-03' },
        ];
        const fresh = allCandidates.filter(c => !alreadyLinked.has(c.basename));

        expect(fresh).toHaveLength(0);

        const expected = content.replace(SRS_BATCH_END, SRS_BATCH_DONE);
        expect(expected).toContain('<!-- llr:srs done -->');
        expect(expected).not.toContain('<!-- llr:srs end -->');
    });

    it('done マーカーの区間では isBatchAllComplete が false を返す', () => {
        const content = [
            SRS_BATCH_START,
            '- [x] [[A]]',
            '- [x] [[B]]',
            SRS_BATCH_DONE,
        ].join('\n');

        expect(isSrsBatchAllComplete(content)).toBe(false);
    });

    it('done マーカーの文字列が正しい', () => {
        expect(SRS_BATCH_DONE).toBe('<!-- llr:srs done -->');
    });
});
