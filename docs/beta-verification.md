# Beta Verification Snapshot

オープンベータ公開準備の確認メモ。
ここでは「確認済み」と「まだ手元で見たいもの」を分けて残す。

## 2026-08-19（v0.4.0）

### 自動確認

- `npm run typecheck`: OK
- `npm run lint`: OK
- `npm test -- --run`: OK（497 passed / 1 skipped）
- `npm run build`: OK
- Desktop / Mobile 配置と `obsidian plugin:reload id=llr`: OK

### 今回追加した回帰境界

- 通常ノート・モーダル・override OFF ではチェックイベントを横取りしない
- デイリーノートのチェックボックスは従来どおり LLR が処理する
- summary leaf が更新非対応の view を持つ場合は例外なく無視する

### 手元または報告環境で継続確認したいもの

- Windows 11 + Excalidraw で、起動直後に描画が空白にならないこと
- モバイルで `section` 複数指定の各行を操作したときの使い心地

## 2026-03-31

### 自動確認

- `npm run build`: OK
- `npm test -- --run`: OK
  - `11 passed, 1 skipped`
  - `184 passed, 1 skipped`
  - routine-engine のフォールバック確認で `Unsupported schedule expression` の stderr は出るが、既存テスト想定内
- `obsidian plugin:reload id=llr`: OK

### 手元で見たいもの

- `Toggle Task`
- `Start Task`
- `Complete Task`
- `Skip Task (Log Only)`
- `Insert Routine`
- `Open Summary View`
- モバイルで短押し / 長押し

### ひとこと

- 公開導線と名称整理は一段落
- 実地テストはこのスナップショットを基準に進める
- モバイル操作は引き続き実機確認が必要

## 2026-04-01

### 実地メモ

- 約24時間の通常運用では大きな違和感なし
- 日次利用を止めるような崩れは今のところ見えていない

### 継続して見たいもの

- モバイルでの短押し / 長押し
- Summary View まわりの細かい使い心地
