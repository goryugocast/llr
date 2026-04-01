# Beta Verification Snapshot

オープンベータ公開準備の確認メモ。
ここでは「確認済み」と「まだ手元で見たいもの」を分けて残す。

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
- `Start Task (Force)`
- `Stop Task (Force)`
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
