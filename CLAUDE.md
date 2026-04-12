# LLR Project Rules

## Repo Overview

- This repository is for the Obsidian plugin `LLR: Live Life Recording system` (plugin ID: `llr`).
- For implementation behavior, prioritize `src/` first.
- For the best written snapshot of current intended behavior, prioritize `docs/specs/STATE_実装状況サマリー.md`.
- Treat `README.md` as public-facing onboarding, not as the final behavioral spec.
- Treat `docs/internal/` as supporting notes, not as public source-of-truth specs.

## Branch Workflow

- `trial/current`: 日常の開発・テスト用ブランチ。Claude との対話開発は基本ここで直接作業する。
- `main`: リリース用。trial で十分テストできたらマージしてリリース。
- ブランチを切るのは、探索的な大きい変更や Codex に非同期で投げる場合のみ。

## Commit Rule

When creating a commit, use a multi-line commit message.

- First line: short subject
- Body: include both of these lines
  - `Intent: ...`
  - `Reflection: ...`

The local `post-commit` hook reads these fields and appends them to the human daily note via the Obsidian CLI.

<!-- BEGIN SHARED: OBSIDIAN PLUGIN -->
## Shared Obsidian Plugin Rules

- Default Obsidian vault: `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local`
- When the task is about Obsidian app behavior, vault content, note operations, plugin operations, or command semantics, prefer the `obsidian` CLI first.
- Start by checking `obsidian help` to confirm the relevant command shape before running other `obsidian` CLI commands.
- This repository path: `/Users/goryugo/GitHub/llr`
- This repository's plugin name: `LLR: Live Life Recording system`
- This repository's plugin ID: `llr`
- Default plugin deploy paths:
  - Desktop: `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/.obsidian/plugins/llr`
  - Mobile: `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/.iphone/plugins/llr`
- After a successful build, reload the plugin in Obsidian as part of the same workflow unless the user explicitly says not to.
  - Reload command: `obsidian plugin:reload id=llr`
- When editing this shared rule source, run the sync script before committing any affected repository.
  - Shared source: `/Users/goryugo/GitHub/_shared/agents/OBSIDIAN_PLUGIN_COMMON.md`
  - Sync command: `/Users/goryugo/GitHub/_shared/agents/sync-obsidian-plugin-agents.sh`
<!-- END SHARED: OBSIDIAN PLUGIN -->

## Local Runtime Paths

- LLR debug JSONL log path: `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/llrlog/logs/debug`
- Daily note path: `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/notes/daily`

## Default Meaning For Common Requests

- "デイリーノートを見て" → daily note area at the daily note path above.
- "tc を見て" / "routine を見て" → routine folder at `<vault>/routine`.
- "ログを確認して" → LLR debug JSONL log folder above.

When these requests are about note content or vault behavior:
- Use `obsidian` CLI (`read`, `search`, `daily:read`, etc.) before falling back to raw file reads.
- If the user says "today's daily note", prefer `obsidian daily:path` or `obsidian daily:read` first.

When the request is about LLR plugin runtime logs or JSONL debugging:
- Go directly to the debug JSONL log path and inspect around the reported local time.
- For mobile issues, prefer the mobile debug logs first.

## Common Workflows

- After implementation changes, prefer `npm run build:sync` and then `obsidian plugin:reload id=llr`.
- When behavior and docs disagree, confirm behavior from `src/` and then update the relevant doc in `docs/specs/`.

## Local Product Notes

- Non-public planning for AI companion / product strategy should be saved in ignored files under `docs/internal/`, not in `docs/specs/` or other public docs.
- Primary local note: `/Users/goryugo/GitHub/llr/docs/internal/NOTE_ai-companion-strategy.private.md`
