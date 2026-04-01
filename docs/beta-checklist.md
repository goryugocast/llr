# Beta Checklist

LLR を実地で試す前や、ひと区切りの確認に使う最小チェック。
「全部を網羅する」より、「日常運用で止まらないか」を短時間で見るためのものです。

## まず見る 7 項目

- `Toggle Task`
  - `- [ ]` から開始できる
  - `- [/]` から完了できる
- `Start Task (Force)`
  - 未着手行や平文行を開始形に寄せられる
- `Stop Task (Force)`
  - 実行中行を完了形にできる
- `Skip Task (Log Only)`
  - `- [ ]` と `- skip:` を相互変換できる
- `Insert Routine`
  - `routine/` から当日分を差し込める
- `Open Summary View`
  - その日の残りと実行中が把握できる
- モバイル操作
  - 短押し / 長押しで破綻しない

## 15 分で回す順番

1. デイリーノートに未着手タスクを 2-3 個書く
2. `Toggle Task` で開始と完了を試す
3. `Start Task (Force)` と `Stop Task (Force)` を 1 回ずつ試す
4. `Skip Task (Log Only)` を往復する
5. `Insert Routine` で当日分を挿入する
6. `Open Summary View` を開いて表示を確認する
7. モバイルでは短押し / 長押しも確認する

## 結果の残し方

短く残すなら、これだけで十分です。

```md
- 2026-03-31 beta check
  - Toggle / Force / Skip / Routine / Summary: OK
  - Mobile long press: 要再確認
  - 気になった点: Summary が未着手先頭へ自動ジャンプしない
```

## うまくいかない時に見る文書

- [open-beta.md](open-beta.md)
- [クイックマニュアル.md](クイックマニュアル.md)
- [コマンド仕様.md](specs/コマンド仕様.md)
- [STATE_実装状況サマリー.md](specs/STATE_実装状況サマリー.md)
