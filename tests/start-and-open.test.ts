import { describe, it, expect } from 'vitest';
import {
    firstWikilink,
    isLineInSrsRegion,
    resolveOpenFocus,
    shouldOpenOnStart,
} from '../src/service/start-and-open';
import { SRS_BATCH_START, SRS_BATCH_END, SRS_BATCH_DONE } from '../src/service/srs-batch';

describe('firstWikilink', () => {
    it('行の先頭リンクのリンク先を返す', () => {
        expect(firstWikilink('- [ ] [[ノートA]]')).toBe('ノートA');
    });

    it('リンクが複数あっても先頭を返す', () => {
        expect(firstWikilink('- [ ] [[先頭]] のあと [[二番目]]')).toBe('先頭');
    });

    it('エイリアス付きは target 側を返す', () => {
        expect(firstWikilink('- [ ] [[target|表示名]]')).toBe('target');
    });

    it('見出し付きリンクは #見出し を残す', () => {
        expect(firstWikilink('- [ ] [[ノート#見出し]]')).toBe('ノート#見出し');
    });

    it('リンクが無い行は null', () => {
        expect(firstWikilink('- [ ] 歯磨き')).toBeNull();
    });

    it('空文字は null', () => {
        expect(firstWikilink('')).toBeNull();
    });
});

describe('isLineInSrsRegion', () => {
    // 行番号は 0 始まり
    const content = [
        '- [ ] [[ルーチンA]]',   // 0
        SRS_BATCH_START,          // 1
        '- [ ] [[SRS_1]]',        // 2
        '- [ ] [[SRS_2]]',        // 3
        SRS_BATCH_END,            // 4
        '- [ ] [[ルーチンB]]',   // 5
    ].join('\n');

    it('区間の内側の行は true', () => {
        expect(isLineInSrsRegion(content, 2)).toBe(true);
        expect(isLineInSrsRegion(content, 3)).toBe(true);
    });

    it('区間の外側の行は false', () => {
        expect(isLineInSrsRegion(content, 0)).toBe(false);
        expect(isLineInSrsRegion(content, 5)).toBe(false);
    });

    it('マーカー行そのものは区間内ではない', () => {
        expect(isLineInSrsRegion(content, 1)).toBe(false);
        expect(isLineInSrsRegion(content, 4)).toBe(false);
    });

    it('done マーカーでも閉じ区間として扱う', () => {
        const doneContent = [
            SRS_BATCH_START,          // 0
            '- [x] [[SRS_1]]',        // 1
            SRS_BATCH_DONE,           // 2
        ].join('\n');
        expect(isLineInSrsRegion(doneContent, 1)).toBe(true);
    });

    it('start マーカーが無ければ false', () => {
        const noMarker = '- [ ] [[SRS_1]]\n- [ ] [[SRS_2]]';
        expect(isLineInSrsRegion(noMarker, 0)).toBe(false);
    });

    it('閉じマーカーが無ければ区間扱いしない', () => {
        const unclosed = [SRS_BATCH_START, '- [ ] [[SRS_1]]'].join('\n');
        expect(isLineInSrsRegion(unclosed, 1)).toBe(false);
    });
});

describe('resolveOpenFocus', () => {
    it('frontmatter が true なら true（区間外でも）', () => {
        expect(resolveOpenFocus({ frontmatterOpenFocus: true, inSrsRegion: false })).toBe(true);
    });

    it('frontmatter が false なら false（区間内でも）', () => {
        expect(resolveOpenFocus({ frontmatterOpenFocus: false, inSrsRegion: true })).toBe(false);
    });

    it('frontmatter 未指定で区間内なら true', () => {
        expect(resolveOpenFocus({ inSrsRegion: true })).toBe(true);
    });

    it('frontmatter 未指定で区間外なら false', () => {
        expect(resolveOpenFocus({ inSrsRegion: false })).toBe(false);
    });
});

describe('shouldOpenOnStart', () => {
    it('設定 ON かつリンクありなら開く', () => {
        expect(shouldOpenOnStart({ enabled: true, link: 'ノートA' })).toBe(true);
    });

    it('設定 OFF なら開かない', () => {
        expect(shouldOpenOnStart({ enabled: false, link: 'ノートA' })).toBe(false);
    });

    it('リンクが無ければ開かない（素通り）', () => {
        expect(shouldOpenOnStart({ enabled: true, link: null })).toBe(false);
    });
});
