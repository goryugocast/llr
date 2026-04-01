# Project-TC Local Agent Rules

<!-- BEGIN SHARED: OBSIDIAN PLUGIN -->
## Shared Obsidian Plugin Rules

This block is shared across local Obsidian plugin repositories under `/Users/goryugo/GitHub` and is synced into each repository's `AGENTS.md`.

- Default Obsidian vault: `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local`
- When the task is about Obsidian app behavior, vault content, note operations, plugin operations, or command semantics, prefer the `obsidian` CLI first.
- Start by checking `obsidian help` to confirm the relevant command shape before running other `obsidian` CLI commands.
- Prefer the `obsidian` CLI over ad-hoc file inspection when the task is about note operations, vault behavior, plugin operations, or command semantics.
- This repository path: `/Users/goryugo/GitHub/project-tc`
- This repository's plugin name: `LLR: Live Life Recording system`
- This repository's plugin ID: `llr`
- Default plugin deploy paths for this repository:
  - Desktop: `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/.obsidian/plugins/llr`
  - Mobile: `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/.iphone/plugins/llr`
- After a successful build for this repository, reload the plugin in Obsidian as part of the same workflow unless the user explicitly says not to.
  - Reload command: `obsidian plugin:reload id=llr`
- When editing this shared rule source, run the sync script before committing any affected repository.
  - Shared source: `/Users/goryugo/GitHub/_shared/agents/OBSIDIAN_PLUGIN_COMMON.md`
  - Sync command: `/Users/goryugo/GitHub/_shared/agents/sync-obsidian-plugin-agents.sh`
  - Default workflow: `sync -> review diffs -> commit`
<!-- END SHARED: OBSIDIAN PLUGIN -->

## Commit Rule

When the assistant creates a commit in this repository, use a multi-line commit message.

- First line: short subject
- Body: include both of these lines
  - `Intent: ...`
  - `Reflection: ...`

Example:

```text
Adjust rollover handling for overdue routines

Intent: Separate deadline tasks from tasks that should remain visible until done.
Reflection: Weekly tasks often need rollover overrides even when their repeat is weekday-based.
```

The local `post-commit` hook reads these fields and appends them to the human daily note via the Obsidian CLI.

## Local Runtime Paths

When testing runtime behavior or investigating device-specific issues for this repository, use these real deployment paths.

- Desktop plugin deploy path:
  `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/.obsidian/plugins/llr`
- Mobile plugin deploy path:
  `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/.iphone/plugins/llr`
- Project-TC debug JSONL log path:
  `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/taskchute/logs/debug`
- Daily note path:
  `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/notes/daily`

When investigating mobile issues, prefer checking the debug JSONL files in the debug log path around the reported local time.

## Default Meaning For Common Requests

Interpret these common phrases as concrete targets immediately, without asking for clarification unless the user indicates a different location.

- "デイリーノートを見て" means the daily note area at `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/notes/daily`.
- "tc を見て" means the routine folder at `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/tc`.
- "ログを確認して" means the Project-TC plugin's debug JSONL log folder at `/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/taskchute/logs/debug`.

When these requests are about note content or vault behavior:

- Start with `obsidian help` and then use the relevant `obsidian` command (`read`, `search`, `search:context`, `files`, `properties`, `tasks`, `daily:*`) before falling back to raw file reads.
- If the user says "today's daily note" or "today のデイリー", prefer `obsidian daily:path` or `obsidian daily:read` first.
- If the user asks about command names, behavior, or available actions in Obsidian, check `obsidian help` before making assumptions.

When the request is specifically about Project-TC plugin runtime logs or JSONL debugging:

- Go directly to the Project-TC debug JSONL log path and inspect the relevant log files around the reported local time.
- For mobile issues, prefer the mobile debug logs first if both desktop and mobile evidence exist.
