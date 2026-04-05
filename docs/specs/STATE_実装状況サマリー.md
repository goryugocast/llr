# Implementation Summary (Current)

現状の実装済み機能と、未実装項目の明示サマリー。

## 1. Implemented

### UI Policy (Current)
- メインのノート（Markdownエディタ）の見た目は、テーマ/Obsidian標準を尊重し、**極力いじらない**方針。
- 例外は、操作状態の識別に必要な最小限の調整のみ（例: 実行中 `[/]` の視認性改善）。
- サイドバー `SummaryView` は専用UIとして、可読性のためのレイアウト・装飾をある程度自由に調整する。

### A. Core Commands
- `Open Summary View`
- `Toggle Task`
- `Adjust Time (1m)`
- `Fix Duration Drift (All Completed Tasks)`
- `Retro Complete Task`
- `Start Task (Force)`
- `Stop Task (Force)`
- `Start Task (Align to Previous Completion)`
- `Interrupt Task`
- `Reset Task (Keep Estimate)`
- `Duplicate Task`
- `Skip Task (Log Only)`
- `Reschedule Routine`
- `Insert Routine`

### B. Core Services
- `src/service/task-transformer.ts`
  - 時刻数・ステータスに応じたトグル変換
  - Smart Estimate（`30`, `1.5h`）
  - Force Action (`start/complete/interrupt/duplicate/retroComplete/taskify`)
- `src/service/routine-reschedule-marker.ts`
  - `@MMDD` / `@M/D` / `@M月D日` / `@YYYY-MM-DD` の routine 先送り指示を解釈
  - 処理済み表記 `→YYYY-MM-DD` への正規化
- `src/service/task-parser.ts`
  - タスク行を `status / times / estimate / content` に分解・合成
  - `[[wikilink]]` を含むタスクでも本文と見積りを分離
  - 末尾 bare 見積り（`15m`, `1h`, `30 min`）の抽出
- `src/service/time-calculator.ts`
  - 終了時刻計算 / 所要時間計算 / テキストからの時間推定
- `src/service/routine-engine.ts`
  - `routine/` 直下ノートの `repeat`（互換: `schedule`）/ `next_due` を処理
  - 完了検知（差分監視）に基づく自動予約・キャンセル
  - `repeat: none/no/0` による停止（`next_due` 削除）
  - 規則未設定時の `repeat: 1` 自動補完
  - `from due` による位相維持ルール
- `src/service/status-bar-calculator.ts`
  - ステータスバー集計ロジック
  - 行末時間表記のみ採用する見積抽出
- `src/service/yaml-parser.ts`
  - `repeat` の英語詳細構文と日本語ショートハンドの正規化・解釈

### C. Status Bar
- `total`, `cursor`, `end` の3要素を表示。
- 平文行も集計対象だが、時間表記は**行末のみ**採用。

### D. Checkbox Press Override (Editor)
- 編集モードのチェックボックス操作を LLR 挙動へ上書き（desktop/mobile）。
- 短押し:
  - `[ ] -> [/]`（現在時刻で開始）
  - `[/] -> [x]`（完了）
  - `[x]` は no-op
- 長押し（モバイル: 450ms / デスクトップ: 900ms）:
  - `[ ] -> [/]`（直近完了の終了時刻で開始。なければ現在時刻）
  - `[/] -> [ ]`（時刻保持）
  - `[x] -> [ ]`（時刻保持）
- 長押し成立後のクリック抑止で二重実行を防止。
- モバイルでは触覚フィードバックを実施（短押し1回、長押し2連続）。

### E. Routine Insert / Daily Note Auto Insert
- `Insert Routine` コマンドで当日 `due` のルーチンを挿入。
- デイリーノート作成時、マーカー検出で自動展開（`vault.on('create')` + 短時間リトライ）。
- 実験中: 外部生成ノート共存のため、起動時/デイリーノート open 時にも **今日のノートのみ** 後追い確認。
- 安全策として、マーカー必須・展開済みスタンプ付きで二重展開を抑制。
- 対応マーカー:
  - `{{llr-today}}`
  - `{{llr-routines}}`
  - `<!-- llr:insert-routine -->`
- `Routine Sections` 設定（時刻 + ラベル）に基づき、`H1` 見出しでグルーピング。

### F. Settings UI (Implemented subset)
- `Debug mode`（Notice + trace JSONL）
- `Estimate Warning`（残り見積りに基づく予定警告表示）
- `Large Mobile Checkboxes`（モバイル表示用トグル）
- `Routine Sections`（時刻 `HHmm` + ラベル、入力/削除/自動ソート）

### G. Debug Trace (Debug Mode)
- `Notice` + JSONL トレースログ（デバッグ用）を実装。
- 保存先は `llrlog/logs/debug/*.jsonl`（`routine/` 外）。
- 目的: コマンド/ルーチン更新の時刻追跡、二重発火や遅延の調査。
- ルーチンフォルダ配下の補助 `.md`（例: `routine/docs`）で不要な通知が出にくいように抑制済み。

### H. Sidebar Summary View (Current)
- `SummaryView`（`llr-summary-view`）を実装。
- 日付ドリブンでデイリーノートを解決（アクティブファイル非依存）。
- ヘッダー:
  - 日付表示 `MM-DD (曜)`
  - 前日 / `TODAY` / 翌日 ナビゲーション
  - 日付ラベルクリックで該当日のノートを開く
  - `summary_role: sleep` のルーチンは `EST. TOTAL` / `EST. FINISH` から除外し、`EST. FINISH` に `HH:mm - HH:mm`（後半小さめ）で睡眠込みの目安時刻を表示
- リスト:
  - 状態別グルーピング (`完了` -> `実行中` -> `未完了`)
  - 動的時刻積み上げ（完了 -> 実行中 -> 未開始）
  - 実行中超過時の現在時刻ベース再計算
  - セクション区切り（細い線 + ラベル）を表示
  - 単一時刻タスクを reserved-start として tail 表示し、遅延分に応じて時刻色を段階変化
  - `[[wikilink]]` をクリック可能（行ジャンプより優先）
  - 行ジャンプはタスク行クリック、カーソルは行末へ配置
- 自動スクロール:
  - 新規表示 / 日付切替時は実行中タスクへ強く合わせる
  - 通常再描画では、見切れている時だけ最小限補正する
  - 手動スクロール後は一定時間、弱い自動補正を止める
  - 近接再描画でも上書きされにくいよう安定化済み

## 2. Not Implemented

### A. Day Boundary / Archive
- `Llr: Start New Day`
- デイリーノート/作業ノートのアーカイブ・ロールオーバー一式

### B. Sidebar Summary View Editing
- サイドバー上でのタスク編集（チェックボックス操作 / インライン編集 / Add Task）
- `app.vault.process` を使った安全な書き戻し

### C. Routine Semantics (Future candidates)
- `start_before` 付きルーチンに対する `@done` 明示完了
  - 前倒し表示期間内でのみ有効化し、その回を消費して `next_due` を次回へ送る案を仕様化中
  - 本文中の `@done` は自動削除しない方針

### D. Settings UI (Future candidates)
- `Work File Path` / `Routine Folder` / `Archive Folder` などの設定UI
- Day boundary / rollover まわりの設定UI

## 3. 廃止・範囲外 (Abolished / Out of Scope)
- **通常利用向けの実測JSONLログ**: 実装しない（記録正本は Markdown）。
  - 例外として **Debug Mode の trace JSONL** は開発用途で実装済み。
- **統計・可視化機能**: `stats.json` やグラフ表示は本体機能に含めない。
- **ポモドーロ・タイマー等**: 外部プラグインや他機能に任せる。
- **カレンダー連携**: 範囲外。
- **重厚な専用ビュー**: テーブル中心の複雑UIは避け、サイドバーサマリーを中心にする。

## 4. Recent Milestones (抜粋)

### 2026-03-05: Pre-release hardening
- 完了行トグル時の順序を安定化（duration drift 補正 -> 見積再計算 -> duplicate）。
- `Fix Duration Drift (All Completed Tasks)` コマンドで全完了行の duration を一括補正可能に。
- Summary View の日付ラベルクリックで、Core Daily Notes API を優先して当日ノートを開く挙動へ改善。

### 2026-03-02: Skip flow and routine lead window
- `Skip Task (Log Only)` を追加。未着手行と `- skip:` ログを相互変換するログ操作を実装。
- `start_before` を実装。`next_due` より前に表示開始する lead window をサポート。

### 2026-02-26: Routine / Repeat semantics refresh
- `repeat` を主パラメータ化（`schedule` は互換読み込み）。
- 日本語ショートハンド（曜日・月次・第N曜日・月末など）を拡充。
- 完了時 `next_due` をデフォルトで完了日基準、`from due` で位相維持に整理。
- `repeat: none/no/0` と `repeat` 未設定時 `repeat: 1` 自動補完を整備。

### 2026-02-26: Debug trace and double-trigger investigation
- `Debug mode`（Notice + JSONL trace）を導入。
- `metadata changed` の差分監視でルーチン更新の過剰反応を解消。
- debugログ保存先を `llrlog/logs/debug` に移し、Base干渉を軽減。
- 旧プラグインID二重起動の再発防止（ビルド同期先整理）。

### 2026-03-02: Sidebar auto-scroll tuning
- 実行中タスクへの自動スクロールを「強い追従 / 弱い補正」に分離。
- 手動スクロール後の一時抑止を追加し、勝手に戻されにくくした。
- 実行中タスクの位置合わせをリスト基準の相対座標に修正し、ヘッダー下に潜り込みにくくした。

### 2026-02-26: Sidebar/Interaction polish
- チェックボックス短押し/長押し再設計（前に合わせる・時刻保持Reset）。
- コマンドアイコン追加（モバイル識別性向上）。
- `Routine Sections` とサイドバー section divider、Estimate Warning、sleep-aware header を追加。
- 実行中タスクへの自動スクロールを改善。

---
最終更新: 2026-03-05
