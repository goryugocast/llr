# CHANGELOG

プレリリース期間の変更履歴。

- Source: `git log --date=short --no-merges`
- Generated: 2026-08-19
- Scope: 最新 80 コミット

## 更新ルール

- 仕様変更を含むコミット後は `npm run changelog:update` を実行する。
- 仕様書の更新日は、この changelog と合わせる。

## Git History Snapshot

### 2026-08-19
- Document the 0.4.0 release (`2850939`)
- Refresh changelog for 0.4.0 (`efca36d`)
- Bump version to 0.4.0 (`a8837b6`)
- Expand external view regression coverage (`f20aece`)
- Refresh generated changelog (`2d7ee0d`)
- Handle external views safely (`f0fc887`)
### 2026-07-28
- Stop future daily notes from advancing routine state (`317ad2b`)
- Stop the frontmatter repair from swallowing body text (`a8b9d41`)
- Restore the 3s grace period for mis-tapped checkboxes (`5759401`)
- Restore the undo grace period for routine completion (`05cf906`)
- Fix regressions found in the initial-due audit (`564d2a8`)
- Derive an initial due date for routines without next_due (`eed3411`)
### 2026-07-20
- Implement multi-section routine expansion for sorting (`f55c00d`)
- Update spec docs for multi-section routine expansion (`2ac9bd6`)
### 2026-07-12
- Fix position of off-plan running tasks in future section (`069d00c`)
- Display running tasks below sleep boundary in sidebar, exclude from estimates (`453331d`)
### 2026-07-09
- Bump version to 0.3.0 (`92b3953`)
- Fix implicit any type errors in routine-sort-order tests (`cfcb39d`)
### 2026-07-08
- Implement start-and-open loop: complete linked note and close tab (`8dc4ded`)
- Consolidate start-and-open logic into handleToggleTask (`07c666c`)
- Adjust start-and-open to respect active tab handling with open_focus (`5d99390`)
- Fix start-and-open to always open in new tab regardless of existing tabs (`f4506bf`)
### 2026-07-07
- Implement start-and-open-note command with SRS-aware cursor control (`599d41c`)
- Add Start and Open feature specification (`50a3e8c`)
- Add blank line between last section and section-less routines (`ea0cee8`)
- Add done marker spec, manual command spec, and completion edge case docs (`8e37f5f`)
### 2026-07-06
- Mark SRS batch as done when no candidates remain (`aa36a02`)
- Add edge case tests for SRS batch completion with memo lines (`6b9bc5a`)
- Add replenish-srs command to command palette (`d6aef72`)
- Fix SRS batch replenishment after plugin reload (`0b55276`)
- Simplify SRS note due-date determination logic (`f8c2176`)
- Update SRS vault-wide sort order implementation and tests (`9639ef2`)
- Move section-less routines after sectioned ones in daily note sort order (`df67dce`)
- Simplify HTML comment markers for SRS batch display (`b452955`)
- Extract generic batch display logic into reusable module (`f4f6a5d`)
- Refactor SRS batch logic into pure functions with comprehensive tests (`eb80688`)
- Implement SRS batch loading with markers and auto-refill (`c3f5b01`)
### 2026-07-05
- Bump version to 0.2.3 (`9841722`)
- Fix startup contention with Templater on daily note creation (`8119bd8`)
- Fix retry logic to avoid file read conflicts after content exists (`c06a729`)
- Add SRS section to README and remove absorbed incubate docs (`44f3362`)
- Update SRS docs: add usage section and reflect current branch state (`a806db9`)
- Bump version to 0.2.2 (`3ce9da0`)
- Support slash-containing daily note formats (year/month subfolders) (`47d9774`)
### 2026-05-30
- Unify routine due catch-up loops into advanceDueUntil (`431ec69`)
### 2026-07-02
- Fix remaining doc drift: unavailable commands, stale toggle matrix, orphan setting (`2052dde`)
- Sync specs, README, and docs index with the current implementation (`ae6900b`)
- Split main.ts and inject SummaryView settings via delegate (`3ccecf0`)
### 2026-07-01
- Insert a blank line before SRS notes in daily note insertion (`bc5dc03`)
### 2026-06-30
- Give SRS settings their own section heading (`a3fb2b6`)
- Move SRS settings under Advanced section (`b11b8b9`)
- Add srsMaxDaily setting to limit SRS notes per day (`34aa3b5`)
- Place SRS notes at bottom of daily note insertion (`5180780`)
- Update SRS spec for vault-wide approach and overdue growth (`eead4ad`)
- Update SRS spec for vault-wide approach and overdue growth (`502ad6a`)
- SRS overdue growth: use elapsed days when longer than repeat (`4d4c7a1`)
- Add srsGrowthEnabled setting and routine/ subfolder exclusion (`af8cc02`)
- SRS recognition: vault-wide by repeat field instead of srs/ folder (`a1c7046`)
- Implement SRS completion with folder-based recognition (`ed03179`)
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

