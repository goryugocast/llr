import { Editor } from 'obsidian';

/**
 * Obsidian の Editor から内部の CodeMirror 6 view 相当を取り出す。
 *
 * CM6 の内部構造は Obsidian/CM6 のバージョンで揺れるため、自己再帰の緩い型で
 * 深いオプショナルアクセスを許容し、見つからなければ null を返す（呼び出し側でフォールバック）。
 * チェックボックスの行解決やコマンド側のカーソル操作など複数箇所で共有する。
 */
export function getCM6View(editor: Editor): Record<string, unknown> | null {
    type CmNode = { cm?: CmNode; view?: unknown; cmEditor?: unknown; editor?: CmNode };
    const raw = editor as unknown as CmNode;
    const candidate = raw.cm?.cm ?? raw.cm ?? raw.cmEditor ?? raw.editor?.cm?.cm?.view ?? raw.editor?.cm ?? null;
    return (candidate as Record<string, unknown> | null) ?? null;
}
