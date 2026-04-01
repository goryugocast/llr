# SQLiteログ保存仕様（JSONL移行 + LLR追記対応）

## 目的

- 既存の `tc/_history.jsonl` を 1 ファイルの SQLite に移行する。
- 将来 `LLR` のデイリーノート由来ログを同じ DB に追記できる形にする。
- 将来の AI 抽出（メモからの追加パラメーター付与）に対応する。

## DBファイル

- 推奨パス: `.../Obsidian_local/tc/history.sqlite`
- 1ファイルで持ち運べることを優先する。

## スキーマ概要

### 1) `raw_events`（必須）
元データの保険。再取り込みや抽出ロジック変更時の再構成に使う。

- `id` INTEGER PRIMARY KEY
- `source` TEXT NOT NULL
- `source_ref` TEXT NOT NULL UNIQUE
- `event_type` TEXT NOT NULL
- `event_date` TEXT
- `raw_json` TEXT NOT NULL
- `event_hash` TEXT NOT NULL UNIQUE
- `imported_at` TEXT NOT NULL（ISO日時）

### 2) `projects`

- `id` INTEGER PRIMARY KEY
- `name` TEXT NOT NULL UNIQUE

### 3) `tags`

- `id` INTEGER PRIMARY KEY
- `name` TEXT NOT NULL UNIQUE

### 4) `task_logs`（主テーブル）
実行ログ、将来の `LLR` 追記先。

- `id` INTEGER PRIMARY KEY
- `raw_event_id` INTEGER UNIQUE（`raw_events.id`）
- `event_date` TEXT NOT NULL（`YYYY-MM-DD`）
- `start_time` TEXT（`HH:MM`）
- `end_time` TEXT（`HH:MM`）
- `start_at_local` TEXT（`YYYY-MM-DD HH:MM:SS`）
- `end_at_local` TEXT（`YYYY-MM-DD HH:MM:SS`）
- `duration_min` INTEGER（`>= 0`）
- `estimate_min` INTEGER（`>= 0`）
- `title` TEXT NOT NULL
- `memo_text` TEXT
- `status` TEXT NOT NULL
  - `done` / `skipped` / `planned` / `template`
- `skip_for_date` TEXT（`YYYY-MM-DD`）
- `project_id` INTEGER（`projects.id`）
- `standard_project_id` INTEGER（`projects.id`）
- `standard_task` TEXT
- `emoji` TEXT

補足:
- 既存 `history.jsonl` の日付あり `task` は `status='done'`
- 日付なし `task` はテンプレ扱いで `status='template'`

### 5) `task_log_tags`

- `task_log_id` INTEGER
- `tag_id` INTEGER
- PRIMARY KEY (`task_log_id`, `tag_id`)

### 6) `daily_summaries`

- `id` INTEGER PRIMARY KEY
- `raw_event_id` INTEGER UNIQUE（`raw_events.id`）
- `summary_date` TEXT NOT NULL
- `title` TEXT
- `narrative` TEXT
- `raw_text` TEXT

### 7) `daily_summary_tags`

- `daily_summary_id` INTEGER
- `tag_id` INTEGER
- PRIMARY KEY (`daily_summary_id`, `tag_id`)

### 8) `ai_annotations`（AI拡張用）
メモからの抽出結果を可変で保存する。将来カラム化するまでの受け皿。

- `id` INTEGER PRIMARY KEY
- `task_log_id` INTEGER NOT NULL（`task_logs.id`）
- `model` TEXT NOT NULL（例: `gpt-5`）
- `schema_version` TEXT NOT NULL（例: `v1`）
- `features_json` TEXT NOT NULL（抽出結果JSON）
- `created_at` TEXT NOT NULL
- UNIQUE (`task_log_id`, `model`, `schema_version`)

## インデックス

- `task_logs(event_date)`
- `task_logs(status, event_date)`
- `task_logs(start_at_local)`
- `task_logs(project_id, event_date)`
- `daily_summaries(summary_date)`

## 制約ポリシー

- 必須は最小限（`event_date`, `title`, `status` など）にする。
- 数値は `CHECK (>= 0)` で壊れた値のみ弾く。
- メモ本文は加工せず `memo_text` にそのまま保存する。

## 将来LLR追記時の保存方針

LLRで持ちたい項目は以下を `task_logs` に直接入れる。

- 時刻（開始/終了）: `start_time`, `end_time`, `start_at_local`, `end_at_local`
- かかった時間: `duration_min`
- 見積り時間: `estimate_min`
- タスク名: `title`
- スキップしたタスク名（日付）: `status='skipped'` + `skip_for_date`
- チェックボックス間メモ: `memo_text`

## 運用ルール

- 生の JSON は `raw_events.raw_json` に必ず残す。
- 同じデータを再投入しても重複しないように `event_hash` を使う。
- 新パラメーターはまず `ai_annotations.features_json` に保存し、使用頻度が高くなったら `task_logs` の正式カラムへ昇格する。
