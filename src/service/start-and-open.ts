/**
 * Start and Open: 開始（`- [ ]` → `- [/]`）と同時にその行のリンク先ノートを開く機能の
 * 純粋ロジック。Obsidian への配線（openLinkText・チェックボックス横取り・設定）は
 * 呼び出し側に置き、ここでは判定だけを扱う。
 *
 * 仕様は docs/specs/スタートアンドオープン仕様.md を参照。
 */

import { batchStartMarker, batchEndMarker, batchDoneMarker } from './batch-display';

/** 行から先頭の `[[wikilink]]` のリンク先を取り出す。無ければ null。
 * エイリアス `[[target|表示名]]` は target 側を返す。見出し `#` は残す（openLinkText が解釈する）。 */
export function firstWikilink(line: string): string | null {
    const m = line.match(/\[\[([^\]]+)\]\]/);
    if (!m) return null;
    return m[1].split('|')[0];
}

/** 指定行（0 始まり）が SRS バッチ区間（start 〜 end/done）の内側にあるか。
 * start とその後ろの end または done で挟まれた行だけを区間内とみなす。
 * マーカー行そのものは区間内ではない。閉じマーカーが無ければ区間扱いしない。 */
export function isLineInSrsRegion(content: string, lineIndex: number, tag = 'srs'): boolean {
    const start = batchStartMarker(tag);
    const end = batchEndMarker(tag);
    const done = batchDoneMarker(tag);
    const lines = content.split('\n');

    let startLine = -1;
    let closeLine = -1;
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (startLine === -1) {
            if (t === start) startLine = i;
            continue;
        }
        if (t === end || t === done) {
            closeLine = i;
            break;
        }
    }
    if (startLine === -1 || closeLine === -1) return false;
    return lineIndex > startLine && lineIndex < closeLine;
}

/** 開いたときカーソルを移すか（openLinkText の active）を決める。
 * frontmatter の open_focus があれば最優先。無ければ SRS 区間内なら true、区間外なら false。 */
export function resolveOpenFocus(opts: { frontmatterOpenFocus?: boolean; inSrsRegion: boolean }): boolean {
    if (typeof opts.frontmatterOpenFocus === 'boolean') return opts.frontmatterOpenFocus;
    return opts.inSrsRegion;
}

/** 開始操作でノートを開くべきか。設定が有効かつ行にリンクがあるときだけ開く。 */
export function shouldOpenOnStart(opts: { enabled: boolean; link: string | null }): boolean {
    return opts.enabled && opts.link !== null;
}
