# Development Plan & Testing Strategy

**STATUS: HISTORICAL (Initial MVP Planning Document)**

「夢」ではなく「現実」を作るための具体的な実行計画。

## 1. Development Environment (開発環境)

### Repository
- **Location**: `~/GitHub/project-tc` (仮プロジェクト名)
- **Language**: TypeScript
- **Bundler**: esbuild (Obsidian標準)
- **Test Runner**: Vitest (高速、ESM対応)

### Directory Structure & Logic Specs
各ロジックの実装前に、必ず対応する **仕様書 (Spec)** を作成する。

```text
project-tc/
├── specs/                  # Logic Specifications (Markdown)
│   ├── 01_TimeCalculator_Spec.md
│   ├── 02_LogFormatter_Spec.md
│   └── 03_Dispatcher_Spec.md
├── src/
│   ├── main.ts             # Entry Point
│   ├── service/            # Business Logic (Pure TS, Testable)
│   │   ├── time-calculator.ts
│   │   ├── log-formatter.ts
│   │   └── dispatcher.ts
│   ├── obsidian/           # Obsidian API Wrapper (Hard to test)
│   │   ├── file-system.ts
│   │   └── editor.ts
│   └── types.ts
├── tests/                  # Unit Tests
│   ├── time-calculator.test.ts
│   └── dispatcher.test.ts
├── manifest.json
└── package.json
```

---

## 2. Testing Strategy (テスト戦略)

UIテストはコストが高いため、**ロジックの単体テスト** を最優先する。

### A. Logic Tests (Vitest)
Obsidian APIに依存しない「純粋なロジック」を切り出し、100%テストする。
- **Time Calculation**: `9:00` + `45m` = `09:45` の計算。
- **Log Formatting**: オブジェクトから正しい JSONL/Markdown 文字列が生成されるか。
- **Dispatcher Logic**: `@[[tc/A]]` や `captures` ルールの判定ロジック。

### B. Mocking Obsidian
ファイル操作などは、実際のファイルシステムを使わず、メモリ上のモックに対してテストする。
- 「ファイルAがあるつもり」で関数を呼び出し、期待通りのパスに書き込まれたかを検証する。

### C. Manual Verification (End-to-End)
実際のObsidian上での動作確認は、以下の「MVPシナリオ」に基づいて行う。
1. `today.md` を開く。
2. `Toggle Task` コマンドを実行 -> 時間が入るか。
3. もう一度実行 -> 完了になり、ログファイルに追記されるか。

---

## 3. MVP Scope (Minimum Viable Product)

**「設定画面なし」「複雑な機能なし」** で、サイクルが回ることだけを目指すVer 0.1。
全て **ハードコード (Hardcoded)** で実装し、設定画面の実装は後回しにする。

### Included in MVP (やること)
- [ ] **Command**: `TaskChute: Toggle Task` (これ1つだけ)
- [ ] **Hardcoded Settings**:
    - Task File: `today.md`
    - Date Boundary: `04:00`
    - Log Path: `taskchute/logs/`
- [ ] **Logic**:
    - スマートエントリー（リンクがあれば `estimate` を取得、なければ `0`）。
    - ログ出力（JSONLへの追記）。

### Excluded from MVP (やらないこと)
- [ ] **Settings Tab**: 設定画面は作らない（`DEFAULT_SETTINGS` で動かす）。
- [ ] **Status Bar**: UI構築の手間を省く。
- [ ] **Drag & Drop View**: テキスト操作のみ。
- [ ] **Complex Repeats**: 単純なリピートのみ、または手動リピート。
- [ ] **Mobile Support**: PCでの動作確認を優先。

---

## 4. Next Step: Project Setup
この計画に基づき、以下のコマンドでプロジェクトを初期化する。

1. `npm init` & Install Dependencies (obsidian, typescript, vitest, etc.)
2. `tsconfig.json` & `esbuild.config.mjs` setup.
3. Git Repository Init.
4. "Hello World" Plugin Build.
