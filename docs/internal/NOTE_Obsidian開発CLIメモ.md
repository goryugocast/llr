# NOTE: Obsidian 開発 CLI メモ

UI 調整やプラグイン開発の反復を速くするための、手元で使える Obsidian CLI コマンドのメモ。

## よく使う開発コマンド

### DevTools を開く

```bash
obsidian devtools
```

### 開発中のコミュニティプラグインをリロードする

```bash
obsidian plugin:reload id=project-tc
```

### アプリのスクリーンショットを撮る

```bash
obsidian dev:screenshot path=screenshot.png
```

### アプリ内で JavaScript を評価する

```bash
obsidian eval code="app.vault.getFiles().length"
```

## UI 調整で便利な補助コマンド

### DOM に要素があるか確認する

```bash
obsidian dev:dom selector=".task-list-label" total
```

### DOM の class を確認する

```bash
obsidian dev:dom selector=".task-list-label" all attr=class
```

### CSS の実効値を確認する

```bash
obsidian dev:css selector=".task-list-item-checkbox" prop=top
```

### コンソールメッセージを見る

```bash
obsidian dev:console
```

### エラーを見る

```bash
obsidian dev:errors
```

## 使いどころ

- `npm run build` のあとに `obsidian plugin:reload id=project-tc`
- class 付与の確認に `obsidian dev:dom`
- CSS の反映確認に `obsidian dev:css`
- 変化を共有するときに `obsidian dev:screenshot`

## 注意

- `plugin:reload` の `id` は例ではなく実際のプラグイン ID を使う
- `project-tc` の開発では `id=project-tc`
