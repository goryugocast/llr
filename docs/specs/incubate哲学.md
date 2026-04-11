# incubate 哲学

## この文書の役割
- **対象**: LLR に追加したい新概念 `incubate` の意味づけ
- **目的**: 既存の routine / daily note / reschedule marker と矛盾しない思想を先に固める
- **Status**: Draft

## 1. 問題意識

LLR の既存 routine は、主に次の2種類を扱うのが得意だった。

- カレンダー的に発生するもの
  - 例: 毎週木曜のゴミ出し
  - 例: 毎月1日の請求確認
- 「完了するまで残す」日課
  - 例: 毎日の運動
  - 例: 今日中に終えたい重要ルーチン

しかし実際の運用には、これとも少し違う第三の対象がある。

- いつかやりたいこと
- たまに見返したいテーマ
- 忘れたくないが、毎日は出てきてほしくないもの
- すぐではないが、完全に失いたくもないもの

GTD 的には `Someday/Maybe` に近いが、単なる保留リストにしたいわけではない。
LLR の中では、**放置ではなく、育てる保留** として扱いたい。

このための概念を、仮に `incubate` と呼ぶ。

## 2. `incubate` は何か

`incubate` は、いまやる予定ではないが、将来また自然に浮上してきてほしい対象を扱う仕組みである。

- 今すぐの義務ではない
- しかし完全に忘れる対象でもない
- 見返すたびに、次の浮上時期が少しずつ先へ伸びていく
- 必要なら、また近くへ戻せる

したがって `incubate` は、一般的な暗記カード SRS をそのまま持ち込むものではない。
むしろ、LLR の task / routine の世界に合わせた **再浮上アルゴリズム付きの保留** として扱う。

## 3. なぜ `SRS` ではなく `incubate` なのか

`SRS` という名前を前面に出すと、次の連想が強すぎる。

- 暗記カード
- ease factor
- hard / good / easy の多段評価
- 学習効率最適化

今回欲しいのはそこではない。

- 基本操作は単純でよい
- 通常はチェックするだけでよい
- 例外的に `@x` / `@hard` で近くへ戻せればよい
- 調整パラメータを note ごとに増やしたくない

そのため、`incubate` は「SRS 的な再浮上ロジックを持つが、学習カードとは別物」として定義する。

## 4. `incubate` は routine と何が違うか

同じ YAML を使ってよい。
しかし、**次回日 (`next_due`) をどう更新するかの方針** が違う。

- `routine/`
  - `repeat` は主に規則を表す
  - 曜日、月次、from due などの calendar semantics を持つ
- `incubate/`
  - `repeat` は現在の interval state として扱える
  - 完了時に、その interval をアルゴリズムで伸ばす
  - `@x` / `@hard` では interval を短く戻す

この違いは YAML ではなく、**フォルダの意味** として表現するのが自然である。

## 5. 既存 YAML をそのまま使う意味

`incubate` のために専用 YAML を大量に増やさない。
LLR がすでに持っている frontmatter をそのまま使えることに価値がある。

- `repeat`
- `next_due`
- `start`
- `estimate`
- `section`
- `start_before`
- `summary_role`

これにより、`incubate` でも既存の表示系がそのまま活きる。

- `start` があれば、その項目を一日のどこで思い出すかを指定できる
- `estimate` があれば、未来側の負荷として見積りに乗る
- `section` があれば、朝 / 昼 / 夜の流れに自然に置ける
- `start_before` があれば、少し早めに思い出すこともできる

つまり `incubate` は別物でありながら、LLR の世界から浮かない。

## 6. 入力哲学

`incubate` の通常操作は単純であるべき。

- 通常:
  - チェックする
  - それだけで次回日は自動で先へ伸びる
- 例外:
  - `@x`
  - `@hard`
  - どちらも「今回は近くへ戻したい」の意味で使う

ここでは、評価の細かさよりも**運用の摩擦の低さ**を優先する。

- 毎回 choice を迫らない
- 基本はチェックだけ
- 失敗 / まだ早い / 超ハードのときだけ marker を使う

## 7. future note との関係

`incubate` も routine と同様に、未来日ノートでは mutation の authority を持たない。

- 未来ノートでは見えてよい
- しかし未来ノートから `next_due` を動かしてはいけない
- `@日付` の routine reschedule と同じく、`incubate` の状態更新も preview-safe を守る

## 8. LLR と別プラグインの境界

`incubate` には、少なくとも2つの体験方向がありうる。

- **daily-surfaced incubate**
  - デイリーノートに task として現れる
  - `start` / `estimate` / `section` を活かして、一日の流れに乗る
  - LLR に入れるなら、まずはこちらが本流
- **command-driven incubate**
  - コマンドで一覧や review queue を呼び出す
  - デイリーノートとは独立した review session を中心に回す
  - これは思想的には LLR 本体より、将来の sibling plugin に近い

重要なのは、両者は YAML や marker を共有できても、**主役となる体験が違う** こと。

- LLR は「今日の流れ」のプラグイン
- command-driven incubate は「必要なときに review を開く」プラグイン

したがって、LLR 内で扱う `incubate` は当面 **daily-surfaced incubate** に寄せるのが自然である。
一方で、command-driven な incubate review system は、別プラグインとして分離する余地を意識しておく。

## 9. 目指す体験

`incubate` は「保留リストを腐らせない」ための仕組みである。

- ただ並べるだけの someday リストにしない
- しかし毎日うるさくもならない
- たまに自然に浮上してきて、必要ならまた先へ送れる
- その過程で、LLR の一日の流れにも乗る

言い換えると、`incubate` は

- deadline management ではなく
- memory system でもなく
- **未来の自分に、ちょうどよい頻度で再会させる仕組み**

として位置づける。
