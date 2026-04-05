# Routine Note Frontmatter Specification

`routine/` 直下のルーチンノート（1ノート = 1ルーチンタスク）における YAML Frontmatter のフィールド仕様。

## Status
- **Implemented (core fields)**
- `repeat` の詳細文法・計算ルールは [[ルーチンエンジン仕様]] を正本とする。

## 1. 目的
- ルーチンタスクの見積り・表示・並び順・次回予定日をノート単位で定義する。
- ノート本文は自由記述、機械処理に必要な値は Frontmatter に集約する。

## 2. Frontmatter Fields (Current)

| Property | Type | Required | Description |
|---|---|---|---|
| `estimate` | number | No | 見積もり時間（分）。展開時に `(30m)` 形式で付与。 |
| `start` | number (`HHmm`) | No | 開始予定時刻。展開時に `09:00 ` を付与。 |
| `start_before` | number \| string | No | `next_due` の何日前から表示するか。`5` / `5 day` / `5 days` / `5日` を受け付ける。 |
| `section` | number (`HHmm`) | No | 展開時の時間帯分類・並び順の補助。`Routine Sections` 設定と連動。 |
| `repeat` | string \| number | No | リピート規則。**主パラメータ**。数値ショートハンドや日本語短縮も可。 |
| `schedule` | string | No | **旧互換**。読み取り対応のみ（新規記述は `repeat` 推奨）。 |
| `frequency` | object | No | **旧旧互換**。読み取り対応のみ。 |
| `next_due` | date (`YYYY-MM-DD`) | System | 次回予定日。完了時に自動更新。 |
| `rollover` | boolean | No | 未完了タスクを翌日以降も持ち越して表示し続けるかどうか。`true` / `false`。 |
| `summary_role` | string | No | サイドバー集計の特別扱い。現状は `sleep` を想定。 |
| `sort_order` | number | No | 展開時の追加ソートキー（小さい順）。 |
| `captures` | object | No | Dispatcher 将来機能向けの予約領域。 |

## 3. `repeat` の扱い（概要）

### 3.1 基本方針
- 新規記述は `repeat` を使う。
- `repeat` は以下を受け付ける:
  - 数値ショートハンド（例: `1`, `10`）
  - 日本語ショートハンド（例: `毎週月曜`, `隔週月水金`, `毎月末`, `第2土曜日`）
  - 英語詳細構文（例: `every week on mon`, `every 5 days from due`）
- 内部では `every ...` 形式へ正規化して解釈する。

### 3.2 特殊値
- `repeat: none` / `repeat: no` / `repeat: 0`
  - 停止扱い。
  - 完了時に `next_due` を更新せず、既存 `next_due` があれば削除する。

### 3.3 未設定時の親切な補完
- `repeat`（および旧 `schedule` / `frequency`）が未設定のノートを完了した場合:
  - `repeat: 1`（毎日）を自動付与
  - `next_due` を翌日に設定

詳細は [[ルーチンエンジン仕様]] を参照。

## 4. `start_before`（前倒し表示）
- `start_before` は `next_due` の更新規則を変えない。
- 役割は「そのルーチンを何日前から表示し始めるか」のみ。
- サポート値:
  - 数字: `5`
  - 英語: `5 day`, `5 days`
  - 日本語: `5日`
- 数字だけの文字列（例: `"5"`）も受け付ける。
- 未指定時は `0` 日扱いで、`next_due` 当日にだけ表示する。
- `next_due` が将来日なら、表示期間は `next_due - start_before` から `next_due` まで。
- `rollover: true` を明示した場合、`next_due` を過ぎても未完了の間はその回を維持したまま表示し続ける。
- `rollover` 未指定または `false` なら、`next_due` を過ぎた時点で次の期日に catch-up し、その新しい期日を基準に表示期間を判定する。
- タスク本文に未処理 `@done` があり、かつ完了基準日がこの表示期間内にある場合に限って、その回を明示的に閉じて次回へ送る。
- 成功した `@done` は `→done` に正規化し、再処理対象から外す。

## 5. `rollover`（未完了時の再表示ポリシー）
- `rollover` は `next_due` を直接更新しない。
- 「今日のタスク書き出し」で、そのルーチンを表示対象に残すかどうかの判定だけを制御する。
- サポート値:
  - `true`
    - **明示指定した場合**、未完了で `next_due` が過去でも、その回のまま毎日表示対象に残し続ける。
    - 「完了するまで毎日残す」習慣向け。
  - `false`
    - 未完了で `next_due` が過去の場合でも、内部的に「次の妥当な発生日」まで進めて判定する。
    - ゴミ出し、曜日固定、月次固定などの予定向け。
- 未指定時の既定:
  - `repeat: none/no/0` -> `true`
  - `every ... from completion`、旧 `after` / `every` -> `true`
  - `every ... from due`、曜日固定、月次固定、年次固定、旧 `daily/weekly/monthly/nth_day/yearly` -> `false`

## 6. `section` と見出し分類
- `section` は `HHmm` を表す数値（例: `700`, `1245`, `1830`）。
- `Insert Routine` およびデイリーノートのマーカー自動挿入では、設定画面の `Routine Sections`（時刻 + ラベル）を用いて分類する。
- 分類ルール:
  - `section` 未設定 -> 先頭（見出しなし）
  - `section` 設定済み -> `section >= time` を満たす最大の時刻のラベルへ
  - 境界と同値はその見出しに含む

## 7. `summary_role`（サイドバー表示専用の補助）
- ノートの見積り/ルーチン更新ロジックそのものを変更するものではない。
- 現状実装の用途:
  - `summary_role: sleep`
  - サイドバー `SummaryView` で、睡眠タスクを `EST. TOTAL` / `EST. FINISH` の通常計算から除外し、睡眠込みの時刻を補助表示する。

## 8. 例

### 8.1 通常ルーチン
```yaml
---
estimate: 30
start: 730
section: 700
repeat: 1
next_due: 2026-02-27
---
```

### 8.2 位相維持したい周期（`from due`）
```yaml
---
repeat: every 5 days from due
next_due: 2026-03-01
---
```

### 8.3 予定日の前日から見せたい固定ルーチン
```yaml
---
repeat: every 4 weeks on tue
start_before: 1 day
next_due: 2026-03-03
---
```

### 8.4 予定日だけに出したい固定ルーチン
```yaml
---
repeat: every week on thu
rollover: false
next_due: 2026-02-27
---
```

### 8.5 完了するまで毎日残したい重要ルーチン
```yaml
---
repeat: every 3 days from completion
rollover: true
next_due: 2026-02-27
---
```

### 8.6 睡眠タスク（サイドバー特別扱い）
```yaml
---
estimate: 480
section: 2400
repeat: 1
summary_role: sleep
next_due: 2026-02-27
---
```

## 9. Legacy Compatibility Notes
- 旧 `schedule` / `frequency` は読み取り互換を維持する。
- ドキュメント上の詳細仕様は `repeat` を正本として記述する。
