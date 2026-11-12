# CHANGELOG

プレリリース期間の変更履歴。

- Source: `git log --date=short --no-merges`
- Generated: 2026-11-12
- Scope: 最新 80 コミット

## 更新ルール

- 仕様変更を含むコミット後は `npm run changelog:update` を実行する。
- 仕様書の更新日は、この changelog と合わせる。

## Git History Snapshot

### 2026-11-12
- Release LLR 0.5.0 with the unified task and timeline view (`07e350d`)
- Refresh LLR view documentation and anonymous screenshots (`3442f6f`)
- Activate mobile date pickers through their native inputs (`fb39744`)
### 2026-11-11
- Reserve an independent lane for timeline hour labels (`377963b`)
- Keep sidebar estimates grouped across pane widths (`6d4a929`)
- Balance sidebar estimates and shared spacing (`3e47bbe`)
- Unify task and timeline sidebar design (`47ad34b`)
### 2026-11-06
- Mark the timeline as planned for the next release (`b5978ff`)
- Use Japanese sample records in LLR screenshots (`4480880`)
- Use Markdown image syntax in the README (`b404b89`)
- Document the unified LLR timeline with screenshots (`5b4f6b8`)
- Harden LLR view state and remove obsolete task rendering (`d4ce569`)
- Unify LLR task and timeline views (`c9d420a`)
- Record unified LLR view design direction (`3e22c92`)
- Center reflection header controls (`77ef58f`)
- Align reflection accordion with approved layout direction (`77c89a9`)
- Preserve unfinished reflection display draft for handoff (`d1e9eb6`)
### 2026-11-05
- Record design handoff and the latest display constraints (`0a2557f`)
- Remove the rejected reflection list comparison (`9ee610e`)
- Add a sidebar-style reading list for comparison (`cff8f26`)
- Fit reflection reading to narrow Obsidian panes (`7c422d0`)
- Record calendar reuse and daily note creation options (`db03885`)
- Open the reflection calendar from the date label (`72daf8e`)
- Clarify that date navigation roles remain undecided (`d65c1bc`)
- Align reflection navigation with the LLR sidebar (`49af977`)
- Match Backlinks expansion control and align header text (`1364bb3`)
- Remove unnecessary reflection region label (`1d516b3`)
- Unify reflection date navigation with LLR controls (`cdf3742`)
- Distribute reflection ticks across expanded activity bands (`14bbf06`)
- Record reflection expansion design review (`2488c48`)
- Separate reflection continuity from hover interaction (`d515818`)
- Align reflection typography and restore equal hour cells (`cecea00`)
- Improve reflection reading space and day context (`178cfad`)
- Record unresolved reflection design findings (`27fbe75`)
- Use a proportional reading timeline for reflection (`2ec8f22`)
- Define equal conditions for reflection design comparison (`beaa4cc`)
- Record reflection visual design findings (`9795a54`)
- Add a single reflection details toggle (`41f10f4`)
- Add repeatable reflection rendering regression checks (`342677d`)
- Keep daily-note preamble out of reflection (`c244853`)
- Exclude unfinished tasks and SRS from reflection (`6fe0a0e`)
- Restore readable memos in the reflection view (`2cf1a2d`)
- Preserve deployed fixes before reflection rollout (`3dbb250`)
- Add a central reflection timeline view (`52bfa6c`)
### 2026-10-10
- Ignore Obsidian property checkboxes and guard task source lines (`6e1430e`)
- Add regression coverage for YAML property checkbox and task-line guard (`1e060b3`)
### 2026-10-18
- Fix Japanese whole-hour routine sections (`310ea42`)
### 2026-10-07
- Refresh changelog for 0.4.2 (`4410221`)
- Prepare the 0.4.2 section ordering release (`18b3d16`)
- Keep extended sleep sections after midnight routines (`11d4ed8`)
- Align section ordering with the existing logical day (`706e605`)
### 2026-08-22
- Refresh changelog for 0.4.1 (`0e5d11c`)
- Correct plugin version to 0.4.1 (`630c825`)
- Refresh changelog for 0.5.0 (`3ff7f10`)
- Bump plugin version to 0.5.0 (`f36f634`)
### 2026-08-21
- Broaden routine section value parsing (`b3f9956`)
- Support comma-separated routine sections (`47435fb`)
### 2026-08-19
- Refresh changelog after release docs (`859a2f4`)
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

