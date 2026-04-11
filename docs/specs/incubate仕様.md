# incubate 仕様（draft）

## この文書の役割
- **対象**: `incubate` 機能の最小仕様
- **目的**: 実装前に、対象・更新則・必要な設定項目を整理する
- **Status**: Draft

## 1. 概要

`incubate` は、`incubate/` フォルダにあるノートを対象に、LLR 既存 YAML を使いながら `next_due` を再浮上アルゴリズムで更新する仕組みである。

- `routine/` は calendar / habit semantics
- `incubate/` は resurfacing semantics

違いは frontmatter の形ではなく、**更新ポリシー** にある。

### 1.1 LLR 内での扱い
- 本 draft は **LLR 内で扱う daily-surfaced incubate** を対象にする。
- コマンドで一覧や queue を直接開く command-driven incubate review は、将来の sibling plugin 候補として別扱いにする。
- ただし YAML / marker / next_due 更新の考え方は共有可能なので、設計上は流用しやすい形を維持する。

## 2. 対象ノート

### 2.1 フォルダ
- 仮の対象フォルダ名は `incubate/`
- 将来的には設定項目 `Incubate Folder` で変更可能にする余地を残す

### 2.2 YAML
- 既存 routine と同じ YAML を使う
- 最小構成:

```yaml
---
repeat: 1
next_due: 2026-04-06
---
```

- 必要に応じて、既存フィールドもそのまま使える
  - `start`
  - `estimate`
  - `section`
  - `start_before`
  - `summary_role`

## 3. `repeat` の意味

### 3.1 routine フォルダ
- `repeat` は既存どおり、規則そのものを表す

### 3.2 incubate フォルダ
- `repeat` は **現在の interval state** として扱う
- v1 では数値（整数日数）を基本とする
- `repeat: 1` は「次回は1日後相当」を表す

## 4. 基本動作

### 4.1 通常の完了
- incubate task を完了すると、現在の `repeat` をもとに新しい interval を計算する
- その interval を `repeat` に書き戻す
- `next_due` は `today + repeat` で更新する

### 4.2 例外マーカー
- `@x`
- `@hard`

### 4.3 例外マーカーの意味
- v1 では `@x` と `@hard` は同じ意味で扱う
- どちらも「今回は近くへ戻したい」の指示
- marker 処理後は処理済み表記へ変換する
  - `@x` -> `→x`
  - `@hard` -> `→hard`

## 5. アルゴリズム

### 5.1 v1 の方針
- note ごとに ease を持たない
- 成長率はプラグイン設定で一括管理する
- 必要なら軽い乱数（jitter）を入れて、同日に集中しすぎないようにする

### 5.2 必要な設定項目（候補）
- `Incubate Growth Rate`
  - 通常完了時の interval 伸び率
- `Incubate Jitter`
  - 伸びる日数に加える小さな揺らぎ
- `Incubate Reset Interval`
  - `@x` / `@hard` 時に戻す interval
- `Incubate Max Interval`
  - 最大日数の上限

### 5.3 v1 の更新イメージ
- 通常完了:
  - `next_repeat = grow(repeat)`
- `@x` / `@hard`:
  - `next_repeat = reset_interval`
- どちらも最後に:
  - `next_due = today + next_repeat`

## 6. 表示

incubate note も既存 routine と同じ描画系に乗る。

- `start` があれば、その時間帯で見える
- `estimate` があれば future 側の負荷として集計に乗る
- `section` があれば Insert / Summary の分類に使える
- `start_before` があれば、due の少し前から見せることもできる

## 7. コマンドと marker

### 7.1 通常経路
- まず普通にチェックする
- それが標準の `good` 相当になる

### 7.2 例外経路
- チェック後に `@x` または `@hard` を追記する
- 専用コマンドで marker を処理する
- このとき `repeat` / `next_due` を近い値へ補正する
- 成功したら marker を `→x` / `→hard` に変換する

## 8. future note ポリシー

- incubate も future note では mutation authority を持たない
- 未来日ノートでは `next_due` 更新や marker 処理を実行しない
- planning / preview-safe を優先する

## 9. open questions

- `repeat` の最小値は常に 1 でよいか
- jitter は deterministic にするか、毎回ランダムでよいか
- `@x` と `@hard` を将来分ける余地をどこまで残すか
- `incubate/` と `routine/` の両方をまたぐ移動時に、既存 `repeat` をどう解釈するか
