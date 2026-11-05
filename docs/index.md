# LLR Docs Index

> **For non-Japanese readers / AI assistants:** Most files in this folder are written in Japanese. Modern LLMs (Claude, GPT-4o, Gemini, etc.) translate transparently — feel free to drop the whole folder into a chat and ask in English. Start with [`specs/STATE_実装状況サマリー.md`](specs/STATE_実装状況サマリー.md) for the current implementation overview, or [`CHANGELOG.md`](CHANGELOG.md) for what changed in the latest release.

Obsidian 上の LLR プラグインの公開ドキュメント入口。
このファイルを最初の参照点にする。

## まず読む（最短導線）
- [CHANGELOG](CHANGELOG.md): Git履歴から生成した変更一覧
- [0.4.2 リリースノート](releases/0.4.2.md): 今回の新機能・改善・修正
- [オープンベータ案内](open-beta.md): いま何を試してほしいかの短い案内
- [ベータチェックリスト](beta-checklist.md): 実地テスト前の最小確認
- [ベータ確認スナップショット](beta-verification.md): いま何を確認済みか
- [クイックマニュアル](クイックマニュアル.md): 実用優先の操作マニュアル
- [チートシート](チートシート.md): `repeat` / 操作の早見表 + 逆引き「こんな時 → これ」
- [実装状況サマリー](specs/STATE_実装状況サマリー.md): 実装済み / 未実装 / **廃止・範囲外** の現状まとめ

### 「これってできる?」の即答先
- 「タイマー・通知・カレンダー連携・統計グラフ」など → [実装状況サマリー §3 廃止・範囲外](specs/STATE_実装状況サマリー.md)
- 「先送り・スキップ・前倒し完了など」 → [チートシート 逆引き](チートシート.md)

## 正本マップ（トピックごとの一次ソース）

同じ話題が複数の文書に出てくるときは、この表の文書を正とする。

| トピック | 正本 |
|---|---|
| `repeat` 文法・`next_due` 計算・今日の表示判定 | [ルーチンエンジン仕様](specs/ルーチンエンジン仕様.md) |
| `section` の単一・複数指定と展開 | [ルーチンノートFrontmatter仕様](specs/ルーチンノートFrontmatter仕様.md) §6 |
| `rollover` 既定値の表 | [ルーチンノートFrontmatter仕様](specs/ルーチンノートFrontmatter仕様.md) §5 |
| `@done` / `→done` の意味と発動条件 | [start_before-@done仕様](specs/start_before-@done仕様.md) |
| `@日付` による先送り | [routine-reschedule-marker仕様](specs/routine-reschedule-marker仕様.md) |
| 未来日付ノートでの状態更新禁止（future-clamp） | [未来日付デイリーノートとルーチン基準日ポリシー](specs/未来日付デイリーノートとルーチン基準日ポリシー.md) |
| タスク行の書式（v2 文法） | [記録フォーマット](specs/記録フォーマット.md) |
| モジュール構成と spec ↔ src の対応 | [アーキテクチャ](specs/アーキテクチャ.md) §3.1 |
| いま実装済みか・未実装か | [実装状況サマリー](specs/STATE_実装状況サマリー.md) |

## 読み方（重要）
- **現状の真実（コードと合っているか）**: `docs/specs/STATE_実装状況サマリー.md`
- **入口（まず使う）**: `docs/index.md` / `docs/open-beta.md` / `docs/beta-checklist.md` / `docs/クイックマニュアル.md`
- **今回の確認状況**: `docs/beta-verification.md`
- **公開仕様の本体**: `docs/specs/` 配下
- **内部メモ / 計画 / プレビュー**: `docs/internal/` 配下

## 構成の役割（短い説明）
- `docs/index.md`: 人間/生成AI共通の入口。読む順番と分類を定義する。
- `docs/open-beta.md`: いまの試し方と期待値を短く共有する。
- `docs/beta-checklist.md`: 実地テスト前の最小チェック項目をまとめる。
- `docs/beta-verification.md`: 現時点での build/test/reload と手元確認の状況を残す。
- `docs/クイックマニュアル.md`: 実用優先の操作説明（まず使う時の入口）。
- `docs/チートシート.md`: 手元カンペ（`repeat` / 操作の早見表）。
- `docs/specs/`: 公開前提の詳細仕様・設計・現状サマリー。
- `docs/internal/`: 作業メモ・計画・履歴・プレビュー類。公開入口からは直接案内しない。

## 読む順番の目安

### 1) まず試したい
1. [オープンベータ案内](open-beta.md)
2. [ベータチェックリスト](beta-checklist.md)
3. [ベータ確認スナップショット](beta-verification.md)
4. [クイックマニュアル](クイックマニュアル.md)
5. [チートシート](チートシート.md)

### 2) 全体把握だけしたい
1. [実装状況サマリー](specs/STATE_実装状況サマリー.md)
2. 必要なら [コマンド仕様](specs/コマンド仕様.md) / [ルーチンエンジン仕様](specs/ルーチンエンジン仕様.md) / [サイドバー要約ビュー仕様](specs/サイドバー要約ビュー仕様.md)

### 3) Routine / repeat を理解したい
1. [ルーチンノートFrontmatter仕様](specs/ルーチンノートFrontmatter仕様.md)
2. [ルーチンエンジン仕様](specs/ルーチンエンジン仕様.md)
3. [設定画面](specs/設定画面.md)

### 4) UI操作を理解したい
1. [クイックマニュアル](クイックマニュアル.md)
2. [コマンド仕様](specs/コマンド仕様.md)
3. [UI操作仕様](specs/UI操作仕様.md)

### 5) サイドバーを理解したい
1. [サイドバー要約ビュー仕様](specs/サイドバー要約ビュー仕様.md)
2. [UI操作仕様](specs/UI操作仕様.md)
3. [実装状況サマリー](specs/STATE_実装状況サマリー.md)

## Function（機能仕様）
- [クイックマニュアル](クイックマニュアル.md)
- [チートシート](チートシート.md)
- [オープンベータ案内](open-beta.md)
- [ベータチェックリスト](beta-checklist.md)
- [ベータ確認スナップショット](beta-verification.md)

- [記録フォーマット](specs/記録フォーマット.md): 記録フォーマットと中断記録の扱い
- [コマンド仕様](specs/コマンド仕様.md): Toggle / Force / Align / Reset / アイコン
- [トグル判定ロジック](specs/トグル判定ロジック.md): 旧設計メモ（時刻個数ベース判定の構想。現行トグルの正本は [コマンド仕様](specs/コマンド仕様.md)）
- [データ永続化](specs/データ永続化.md): Markdown 正本 + Debug trace JSONL 例外
- [ルーチンノートFrontmatter仕様](specs/ルーチンノートFrontmatter仕様.md): ルーチンノートの Frontmatter
- [ルーチンエンジン仕様](specs/ルーチンエンジン仕様.md): `repeat` / `next_due` 更新ロジック
- [UI操作仕様](specs/UI操作仕様.md): 短押し / 長押しと UI ポリシー
- [設定画面](specs/設定画面.md): 実装済み設定と将来候補
- [デイリーノート自動挿入](specs/デイリーノート自動挿入.md): マーカー方式
- [サイドバー要約ビュー仕様](specs/サイドバー要約ビュー仕様.md): サイドバー詳細仕様
- [デバッグモード](specs/デバッグモード.md): Notice と trace JSONL
- [start_before-@done仕様](specs/start_before-@done仕様.md): 前倒し中の `@done` で次回送り
- [routine-reschedule-marker仕様](specs/routine-reschedule-marker仕様.md): `@MMDD` で routine 先送り
- [未来日付デイリーノートとルーチン基準日ポリシー](specs/未来日付デイリーノートとルーチン基準日ポリシー.md): future-clamp 方針
- [SRS仕様](specs/SRS仕様.md): 完了で `repeat` が育つ SRS growth（設定で有効化する実験機能。使い方はこの仕様書の「使い方」節）

## Design（設計思想）
- [設計思想](specs/設計思想.md)
- [アーキテクチャ](specs/アーキテクチャ.md)
- [UI操作仕様](specs/UI操作仕様.md): 操作体系と補正発火ポリシー

## Tech（技術詳細）
- [時刻計算](specs/時刻計算.md)

## Status（現状）
- [実装状況サマリー](specs/STATE_実装状況サマリー.md)
- [CHANGELOG](CHANGELOG.md)

---
最終更新: 2026-08-19
