# LLR: Live Life Recording system

"Definition creates trace."

## English

LLR is an Obsidian plugin for people who want to keep working directly in Markdown while still recording task start times, finish times, interruptions, and a lightweight day summary.

It is built around a simple idea: the note itself is the definition. Tasks, routines, links, estimates, and daily flow should stay readable in Markdown first, and the plugin should help you operate on that text without replacing it with a hidden system.

### Philosophy

LLR is designed around a few core ideas:

- Notes are the source of truth.
- Markdown should remain readable before and after you use the plugin.
- A daily note can be a stable workspace, not just a log output.
- Links can carry meaning, context, and eventually estimation.
- The plugin should accelerate task-state transitions, not force a heavy structured workflow.

In practice, LLR tries to preserve the feeling of "I am still just writing in my note" while making it much faster to move between unstarted, running, completed, interrupted, and reviewed states.

### Status

This plugin is currently in an open beta style release phase.

- Primary goal: let real daily use shape the next round of polish
- Recommended install path for now: BRAT
- Community catalog submission: not yet
- We are intentionally not blocking beta release on bigger future work such as sidebar editing or day-archive automation

### Open Beta Focus

LLR is ready for real daily use, but it is still being tuned through actual operation.

- Good time to try: if you want to run your day directly from a Markdown daily note
- Good expectation: core task transitions, routine insertion, and summary tracking should work
- Not the current focus: polishing every edge case before release, or waiting for larger future features

### Try It In 5 Minutes

1. Create a daily note with a few unchecked tasks.
2. Start a task with `Toggle Task`.
3. Complete it with `Toggle Task` again.
4. Open the Summary View.
5. Insert a routine from `routine/` if you already keep repeating notes there.

### What It Does

- Smart task toggle behavior for `- [ ]`, `- [/]`, and `- [x]`
- Start, stop, interrupt, duplicate, retro-complete, and reset commands
- Planned-start parsing such as `- [ ] 1800 Dinner 30m`
- `Skip Task (Log Only)` to move tasks in and out of planning without deleting content
- Duration drift repair for completed tasks
- Routine insertion from a dedicated routine folder
- Summary sidebar with day navigation, remaining estimate, and running-task tracking

### What LLR Is For

LLR is a good fit if you want:

- a task workflow that stays close to plain Markdown
- start and finish records without leaving the editor
- a daily note that works as both plan and log
- a lightweight sidebar that helps you stay oriented during the day

It is less about project database management, and more about keeping the daily flow visible and editable in one place.

### Install With BRAT

For now, the easiest way to try LLR is through BRAT.

1. Install the BRAT plugin in Obsidian.
2. In BRAT, choose `Add Beta plugin`.
3. Paste this repository URL.
4. Select `LLR: Live Life Recording system`.

After installing, enable the plugin in Obsidian community plugins.

### Core Task Format

Examples of the main line formats:

- Unstarted: `- [ ] Task (30m)`
- Unstarted with planned start: `- [ ] 18:30 [[Dinner]] (40m)`
- Unstarted with compact planned start: `- [ ] 1800 Dinner 30m`
- Running: `- [/] HH:mm - Task`
- Completed: `- [x] HH:mm - HH:mm (actualm) Task`
- Completed with estimate delta: `- [x] HH:mm - HH:mm (estimatem > actualm) Task`
- Skip log: `- skip: ...`

For unchecked tasks, if the first token after `- [ ]` is `HH:mm` or `HHmm`, LLR treats it as the planned start time and removes it from the displayed task body.

### Example Flow

You can start with lines like these:

```md
- [ ] 1800 Dinner 30m
- [ ] Write review (20m)
- [ ] [[Morning Run]] 15m
```

Then operate on them with toggle or commands:

- `- [ ] 1800 Dinner 30m`
  becomes
  `- [/] 18:00 - Dinner (30m)`
- a running task can become a completed record with actual time
- an interrupted task can leave both a completed trace and a fresh unchecked follow-up line

### Notes On Current Behavior

- Short checkbox press starts or completes tasks
- Long checkbox press supports align-to-previous-completion and reset flows
- The summary sidebar auto-scroll behavior currently prioritizes running tasks
- If no running task exists, the sidebar currently restores scroll position rather than jumping to the first upcoming task

## 日本語

LLR は、Markdown の自由入力を崩さずに、開始時刻・完了時刻・中断・その日の流れを記録するための Obsidian プラグインです。

根本にある考え方はシンプルで、「ノートこそが定義である」というものです。タスク、ルーチン、リンク、見積り、日々の流れは、まず Markdown として読める形で存在していてほしい。プラグインは、そのテキストを別の隠れた仕組みに置き換えるのではなく、操作を速くするために働くべきだと考えています。

### 設計思想

LLR は、次のような考え方の上に作られています。

- ノートそのものを定義として扱う
- Markdown は、利用前後でも読みやすくあるべき
- デイリーノートは単なる出力先ではなく、思考の定位置になれる
- リンクは参照だけでなく、意味や文脈、将来的には見積りも担える
- プラグインは重い入力フォームを強制するのではなく、状態遷移を速くするべき

つまり LLR は、「結局ただノートを書いている感覚」を壊さないまま、未着手・実行中・完了・中断・見直しといった流れをすばやく扱えるようにすることを目指しています。

### 現在のステータス

- フェーズ: オープンベータ寄りのプレリリース
- いまの主目的: 実運用で違和感のあるところを拾いながら整えること
- 現時点での導入方法: BRAT 推奨
- Community Plugins への正式公開: まだ
- Sidebar 上の編集や日次アーカイブ自動化のような大きめ機能は、現時点では正式公開の必須条件にしない

### オープンベータで見ていること

LLR は、日々の運用で使える段階には入っていますが、まだ「実地で整える」フェーズです。

- 向いている試し方: Markdown のデイリーノート上でその日の流れを回したい
- 期待してよい範囲: 基本の開始/完了記録、ルーチン挿入、Summary View での把握
- まだ前提にしないもの: すべての端ケースの磨き込みや、大きめ将来機能の完成

### まず 5 分で試すなら

1. デイリーノートに未着手タスクをいくつか書く
2. `Toggle Task` で開始する
3. もう一度 `Toggle Task` で完了する
4. Summary View を開く
5. すでに繰り返しノートがあるなら `routine/` から `Insert Routine` を試す

### 主な機能

- `- [ ]` / `- [/]` / `- [x]` を前提にしたスマートなトグル
- Start / Stop / Interrupt / Duplicate / Retro Complete / Reset 系コマンド
- `- [ ] 1800 ばんごはん 30m` のような開始見込み時刻の解釈
- `Skip Task (Log Only)` による計画対象からの一時退避
- 完了行の duration ずれ補正
- 専用フォルダからのルーチン挿入
- 日付移動・残見積・実行中追従を持つサイドバー Summary View

### 何のためのプラグインか

LLR は、次のような人に向いています。

- タスク管理を Markdown からあまり離したくない
- 開始時刻や完了時刻をエディタ上ですばやく残したい
- デイリーノートを計画と記録の両方の場として使いたい
- その日の流れを軽いサイドバーで見失わずにいたい

データベース的なプロジェクト管理ツールというより、日々の流れをひとつのノートの中で見えるまま扱うためのプラグインです。

### BRAT でのインストール

正式公開前のあいだは、BRAT 経由での導入を前提にしています。

1. Obsidian で BRAT をインストールする
2. BRAT の `Add Beta plugin` を開く
3. このリポジトリの URL を貼る
4. `LLR: Live Life Recording system` を選ぶ

その後、Community Plugins から LLR を有効化してください。

### 基本的な記録フォーマット

- 未着手: `- [ ] タスク (30m)`
- 未着手 + 開始見込み: `- [ ] 18:30 [[晩ごはん]] (40m)`
- 未着手 + 4桁開始見込み: `- [ ] 1800 ばんごはん 30m`
- 実行中: `- [/] HH:mm - タスク`
- 完了: `- [x] HH:mm - HH:mm (実績m) タスク`
- 完了 + 見積差分: `- [x] HH:mm - HH:mm (見積m > 実績m) タスク`
- skip ログ: `- skip: ...`

`- [ ]` の直後の先頭トークンが `HH:mm` または `HHmm` なら、LLR はそれを開始見込み時刻として扱い、表示上のタスク本文からは取り除きます。

### 使い方のイメージ

たとえば、最初はこんな行から始められます。

```md
- [ ] 1800 ばんごはん 30m
- [ ] レビューを書く (20m)
- [ ] [[朝ラン]] 15m
```

これをトグルやコマンドで操作していくと、

- `- [ ] 1800 ばんごはん 30m`
  は
  `- [/] 18:00 - ばんごはん (30m)`
  になる
- 実行中タスクは実績時間つきの完了記録にできる
- 中断したタスクは、完了ログと未着手の続き行の両方を残せる

### 現状の挙動メモ

- チェックボックス短押しで開始または完了
- 長押しで前の完了時刻に合わせた開始や reset を実行
- Summary View の自動スクロールは、現状では実行中タスク優先
- 実行中がないときは、いまのところ未着手先頭へは飛ばず、スクロール位置復元を優先

## Documentation / ドキュメント

- Entry point / 入口: [docs/index.md](docs/index.md)
- Open beta notes / ベータ向け案内: [docs/open-beta.md](docs/open-beta.md)
- Beta checklist / 実地確認: [docs/beta-checklist.md](docs/beta-checklist.md)
- Quick guide / クイック利用: [docs/クイックマニュアル.md](docs/クイックマニュアル.md)
- Cheatsheet / 早見表: [docs/チートシート.md](docs/チートシート.md)
- Current implementation status / 実装現状: [docs/specs/STATE_実装状況サマリー.md](docs/specs/STATE_実装状況サマリー.md)
- Command behavior / コマンド仕様: [docs/specs/コマンド仕様.md](docs/specs/コマンド仕様.md)
- Summary sidebar behavior / サイドバー仕様: [docs/specs/サイドバー要約ビュー仕様.md](docs/specs/サイドバー要約ビュー仕様.md)
- Changelog / 変更履歴: [docs/CHANGELOG.md](docs/CHANGELOG.md)

## Development

```bash
npm install
npm run dev
npm run dev:sync
npm run build
npm run build:sync
npm run test
```

In this repository, build and local deploy are intentionally separated.

- `npm run build` only bundles the plugin
- `npm run build:sync` bundles and syncs the built artifacts to the local Obsidian plugin folders configured in [`esbuild.config.mjs`](/Users/goryugo/GitHub/llr/esbuild.config.mjs)
- `npm run dev:sync` does the same in watch mode

Recommended local verification flow:

1. Run `npm run build:sync`
2. Reload the plugin in Obsidian

```bash
obsidian plugin:reload id=llr
```

3. Check a daily note with these actions:
   - `Toggle Task`
   - `Start Task`
   - `Skip Task (Log Only)`
   - `Open Summary View`

## License

MIT
