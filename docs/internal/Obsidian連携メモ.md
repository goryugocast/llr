# Obsidian Bridge Logic Specification

## 1. Overview
Obsidianのエディタ (`MarkdownView`) と純粋なロジック (`TimeCalculator`, `TaskTransformer`) を繋ぐ「コントローラー」の仕様。
ユーザーの「入力補助」と「計算実行」がいつ、どのように行われるかを定義する。

## 2. Input Assistance (入力補助)
MVPでは「オートコンプリート」や「常時監視」は行わず、**コマンド実行時** にのみ介入する。

### A. Insert Routine (Command)
1. **Trigger**: コマンド `TaskChute: Insert Routine`
2. **UI**: Obsidian標準の `SuggestModal` を表示。
    - 候補: `tc/` フォルダ内のノート一覧 + 履歴。
3. **Action**: 選択したノートへのリンクをカーソル位置に挿入。
    - Output: `- [ ] [[tc/Routine]]`

### B. Smart Entry (On Toggle)
タスク開始時 (`- [ ]` -> `- [/]`) に、リンク先のノートを読みに行き、見積もり時間を取得する。

## 3. Calculation & Execution Flow (計算ロジック)

### A. The "Toggle" Logic (Command)
ユーザーが `Cmd+L` (Toggle Task) を押した瞬間の処理フロー。

1. **Get Current Line**: カーソルがある行のテキストを取得。
2. **Transform**: `transformTaskLine(line, now)` を実行。
    - **Nullの場合**: 何もしない (Indented line / no-op)。
    - **Resultの場合**: `update`/`insert`/`complete` の結果を反映。
3. **Branch**:
    - **Case 1: Unstarted (`- [ ]`)** -> **Start**
        - 現在時刻 (`09:00`) を取得。
        - リンク (`[[Task]]`) があれば、Dispatcher経由で `estimate` (例: 45) を取得。
        - テキストを置換: `- [/] 09:00 - [[Task]] (45m)`
    - **Case 2: Running (`- [/]`)** -> **Complete**
        - 現在時刻 (`09:42`) を取得。
        - 開始時刻 (`09:00`) との差分 (`42m`) を計算 (`TimeCalculator`)。
        - テキストを置換: `- [x] 09:00 - 09:42 (42m) [[Task]]`
        - **Side Effect**: 現行仕様では外部ログへの追記は行わない。

### B. Status Bar Update (Polling/Event)
ステータスバーの「残り時間」は、ファイル変更ではなく「時間経過」で変わるため。

1. **Trigger**: `editor-change` 後の 500ms デバウンス、およびカーソル移動時の再計算
2. **Logic**:
    - 現在のアクティブなエディタを走査し、行末時間表記を集計する。
    - Running 行は `見積 - 経過時間` を残りとして計上（0未満は0）。
    - `total | cursor | end` 形式で表示する。

## 4. Wrapper / Decorator
**MVPでは実装しない**。
将来的に `EditorExtension` (CodeMirror Plugin) を使い、以下の補助を行う予定。
- 時刻部分 (`09:00 - 09:45`) を薄く表示。
- 実行中タスクの行背景色を変更。
