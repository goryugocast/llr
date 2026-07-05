# CHANGELOG

プレリリース期間の変更履歴。

- Source: `git log --date=short --no-merges`
- Generated: 2026-07-05
- Scope: 最新 80 コミット

## 更新ルール

- 仕様変更を含むコミット後は `npm run changelog:update` を実行する。
- 仕様書の更新日は、この changelog と合わせる。

## Git History Snapshot

### 2026-07-05
- Support slash-containing daily note formats (year/month subfolders) (`47d9774`)
### 2026-07-02
- Fix remaining doc drift: unavailable commands, stale toggle matrix, orphan setting (`2052dde`)
- Sync specs, README, and docs index with the current implementation (`ae6900b`)
- Split main.ts and inject SummaryView settings via delegate (`3ccecf0`)
### 2026-06-30
- Update SRS spec for vault-wide approach and overdue growth (`eead4ad`)
- Add utility function tests for yaml-parser module (`ea1e016`)
- Remove dead code and add 34 tests for uncovered branches (`696a73d`)
- Add 80 tests to cover untested pure-function branches (`0a1d907`)
- Add SRS configuration constants and options to routine engine (`9cb377a`)
### 2026-05-29
- Extract daily-note routine auto-insert into controller (`3b3cb88`)
- Extract routine completion snapshot store (`ba95bb7`)
- Extract checkbox gesture handling into CheckboxInteractionController (`e2acbd4`)
- Document module layout and main.ts split plan (`70f484b`)
- Remove dead type aliases and unused binding (`2db5707`)
- Extract debug logging into DebugLog service (`a92a368`)
- Close type-check gate hole and dedup date/text utilities (`88b34c1`)
- Implement daily note folder fallback configuration (`a65b3a3`)
### 2026-05-28
- Drop plugin-name prefix from description; remove README TODO comment (`497747d`)
- Consolidate version history into CHANGELOG.md (`dc29c03`)
- Refactor changelog structure and update specs documentation (`2db389c`)
- Fix completion-anchored routine rollover bug (`064e90c`)
### 2026-05-27
- Update plugin name to match Obsidian portal display (`57adc24`)
### 2026-05-22
- Add English orientation note at top of docs/index.md (`c087696`)
- Rewrite README in pure English (`d5c7a84`)
- Use English Summary View screenshot for README (`3702dd7`)
- Replace README screenshots with English versions (`144a5d9`)
- Rewrite README with full restructure (`83592fd`)
- Add GitHub Release workflow with artifact attestation (`35ae7e8`)
- Address Obsidian portal lint warnings (`5c021c1`)
- Improve spec findability for user FAQs (`c985532`)
- Sync v0.2.0 specs and add version notes (`e62f892`)
- Fix completion-anchored schedule rollover default (`3d9ba15`)
- Release v0.2.0: bump version after trial/current merge (`2213c83`)
### 2026-05-20
- Clean up temporary worktree (`0b69e2a`)
### 2026-05-19
- Track worktree directory for Claude Code session state (`49db766`)
### 2026-05-16
- Update worktree submodule to latest commits (`f5bb749`)
- Release v0.1.9: fix minAppVersion and plugin name for community portal (`2ce8a1a`)
- Add Claude Code worktree submodules (`45cee22`)
- Show notes with no repeat and no next_due every day (`e09383a`)
### 2026-05-15
- Default repeat to every day when not explicitly set (`40eabfb`)
### 2026-04-30
- Refactor rollover check to use helper method (`927d373`)
### 2026-04-15
- trial/current: cleanup and refactoring (`a9f9cc0`)
- Release v0.1.8: bot-clean lint pass over full ruleset (`f8818d2`)
- Refactor summary view, async handlers, and UI improvements for 0.1.8 release (`5360740`)
- Fix eslint no-period-abbreviations in summary-view labels (`515cfd0`)
- Document build/deploy/reload workflow for trial/current branch (`052e53a`)
- Fix ESLint configuration and async/await issues (`cbab5b7`)
- Release v0.1.7: pass obsidian-releases bot lint scan (`11a127c`)
- Remove async/await from synchronous handlers and fix settings headings (`b3b9826`)
- Release v0.1.6: bump version to ship this-binding fix from 0.1.5 (`e80d693`)
- docs: exclude CLAUDE.md from version control (`653e16c`)
- Fix no-base-to-string violations in summary-view.ts (`9bfb487`)
- Remove forced disk write in completeTask (`a7353f8`)
- Add git pre-commit hook and deploy script (`aa968e7`)
- Apply obsidianmd eslint rule fixes (`c75fd59`)
- Fix debug Notice deferral to prevent iOS tap suppression (v0.1.4) (`4a6fd02`)
- Defer debug notice display to avoid suppressing iOS click events (`6060bda`)
- Force immediate disk write after completeTask to prevent iCloud revert on iOS (`27ff963`)
- Revert to v0.1.0 command structure with improved UI labels (`b3a300b`)
- Refactor: Simplify TypeScript type handling and improve code clarity (`6db7bad`)
- Add elementAtHeight as Strategy 3 for better line position resolution (`74968dd`)
- Refactor and clean up TypeScript code for improved maintainability (`0882ebe`)
- Capitalize UI labels and fix async handling in command callbacks (`1dd2e04`)
- Use elementAtHeight for fold-aware line calculation (`e81e559`)
- Fix this-binding and type safety issues from lint refactor (`74dee4e`)
- Replace coordinate-based fallback with DOM index + visibleRanges strategy (`e5a14de`)
- Fix type safety and simplify Daily Notes plugin access with optional chaining (`f96ea6b`)
- Fix cursor placement when task has no preceding text (`527e40e`)
### 2026-04-14
- Remove unnecessary async from handle methods and their callbacks (`2a564a8`)
- Rename cursor placement symbols to reflect actual intent (`0904490`)
- Add ESLint setup and fix lint issues in trial/current (`2740b3f`)
- Add ESLint setup with Obsidian plugin rules (`173b7ac`)
- Clean up cursor spec and dead code (`dcad092`)
- Fix remaining ESLint issues from Obsidian bot scan (`3b95d8a`)
- Fix cursor position on task start/complete (`bbd1639`)
- Add ESLint configuration for strict TypeScript linting (`a104535`)
- Add Obsidian bot review workflow rule to CLAUDE.md (`826392e`)
- Fix ESLint issues flagged by Obsidian community plugin bot (`c105578`)
- Fix ESLint issues flagged by Obsidian community plugin bot (`404d3ab`)

