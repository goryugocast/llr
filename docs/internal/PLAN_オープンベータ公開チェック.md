# LLR オープンベータ公開チェック

「正式公開前のきっちりした完成」ではなく、BRAT で安心して試してもらえる最低限を揃えるためのメモ。

## 今回の公開スタンス

- まずは `main` / `codex/release-prep` を基準に、日次運用で使える版を出す
- 未実装の大きい要素が残っていても、README で明示できていれば止めない
- 追加機能より「壊れにくさ」「導入しやすさ」「説明のしやすさ」を優先する

## 今回の公開で揃っていればよいもの

- [x] `npm run build` が通る
- [x] `npm run test -- --run` が通る
- [x] BRAT 前提の README がある
- [x] `manifest.json` / `package.json` / `LICENSE` の最低限が揃っている
- [x] `versions.json` を置いて、将来の公開導線を潰さない
- [ ] 手動確認の最小セットを 1 周できている
- [ ] changelog の更新日を今回の区切りに合わせる

## 手動確認の最小セット

- [ ] `Toggle Task`
- [ ] `Start Task (Force)`
- [ ] `Stop Task (Force)`
- [ ] `Skip Task (Log Only)`
- [ ] `Insert Routine`
- [ ] `Open Summary View`
- [ ] モバイルで短押し / 長押しが破綻していない

## 今回は無理に閉じなくてよいもの

- Sidebar 上での直接編集
- 日次アーカイブ / ロールオーバー自動化
- AI companion 系 onboarding の統合
- SRS 系の検討と試作
- Community Plugins への正式提出

## 次の一手

1. changelog を更新する
2. 手動確認の結果を短く残す
3. 必要なら `main` に寄せて BRAT 用タグ / リリース導線を作る
