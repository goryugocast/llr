# LLR Docs Index

Obsidian 上の LLR プラグインの公開ドキュメント入口。
このファイルを最初の参照点にする。

## まず読む（最短導線）
- [オープンベータ案内](open-beta.md): いま何を試してほしいかの短い案内
- [ベータチェックリスト](beta-checklist.md): 実地テスト前の最小確認
- [ベータ確認スナップショット](beta-verification.md): いま何を確認済みか
- [クイックマニュアル](クイックマニュアル.md): 実用優先の操作マニュアル
- [チートシート](チートシート.md): `repeat` と操作の早見表
- [実装状況サマリー](specs/STATE_実装状況サマリー.md): 実装済み / 未実装 / 廃止の現状まとめ
- [CHANGELOG](CHANGELOG.md): プレリリース変更履歴

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
- [トグル判定ロジック](specs/トグル判定ロジック.md): 忖度トグルの判定と見積り解釈
- [データ永続化](specs/データ永続化.md): Markdown 正本 + Debug trace JSONL 例外
- [ルーチンノートFrontmatter仕様](specs/ルーチンノートFrontmatter仕様.md): ルーチンノートの Frontmatter
- [ルーチンエンジン仕様](specs/ルーチンエンジン仕様.md): `repeat` / `next_due` 更新ロジック
- [UI操作仕様](specs/UI操作仕様.md): 短押し / 長押しと UI ポリシー
- [設定画面](specs/設定画面.md): 実装済み設定と将来候補
- [デイリーノート自動挿入](specs/デイリーノート自動挿入.md): マーカー方式
- [サイドバー要約ビュー仕様](specs/サイドバー要約ビュー仕様.md): サイドバー詳細仕様
- [デバッグモード](specs/デバッグモード.md): Notice と trace JSONL

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
最終更新: 2026-04-05
