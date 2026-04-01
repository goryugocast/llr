# LLR ロードマップ (Open Beta Path)

> この文書は「これから何を詰めるか」の管理用。実装済み一覧は [[STATE_実装状況サマリー]] を正とする。

## 現在地（2026-03-31）

- フェーズ: **Open beta hardening**
- 方針: 追加機能より、挙動安定化・仕様同期・BRAT 導線の整備を優先
- 温度感: 「きっちり完成させてから出す」ではなく、「日次運用で困らない最低限を揃えて出す」

## Phase 1: Core Runtime (Completed)

- [x] Toggle/Force/補助コマンド群
- [x] Routine Engine（`repeat` / `next_due` 更新）
- [x] Debug trace（Notice + JSONL）
- [x] Daily note marker 展開

## Phase 2: Daily Operations (Mostly Completed)

- [x] Sidebar Summary View（閲覧/ジャンプ/日付ナビ）
- [x] Auto-scroll 安定化
- [x] `Skip Task (Log Only)`（旧 `Defer Task To Tomorrow`）
- [x] `start_before` lead-window
- [ ] Sidebar 上の編集（チェック/インライン/Add）

## Phase 3: Open Beta Hardening (Active)

- [x] 完了行 duration drift の一括補正コマンド
- [x] Summary View の日次ノート解決改善（Core Daily Notes API 優先）
- [x] `git log` 由来 changelog 導入（`docs/CHANGELOG.md`）
- [x] 配布メタの最低限整理（`LICENSE`, `versions.json`）
- [ ] 主要ドキュメントの最終同期（README / コマンド / 設定 / 状態）
- [ ] 回帰テスト手順の軽量固定（モバイル/デスクトップ）
- [ ] BRAT での導入説明と「未実装だが後回しにするもの」の線引き明示

## Open Beta Exit Criteria

- [ ] 主要コマンドの手動確認が数日レベルで大崩れしない
- [ ] README と主要仕様メモの大きな齟齬がない
- [x] `npm run build` / `npm run test` が通る
- [ ] 変更履歴が `docs/CHANGELOG.md` に反映されている
- [ ] 「今回は見送るもの」が自分で説明できる状態になっている

## Out of Scope（現時点）

- 日次アーカイブ/ロールオーバーの自動化
- 統計ダッシュボード/グラフ
- カレンダー連携
- 専用大型ビュー（テーブル中心 UI）

---
最終更新: 2026-03-31
