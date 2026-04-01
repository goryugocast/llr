# CHANGELOG

プレリリース期間の変更履歴。

- Source: `git log --date=short --no-merges`
- Generated: 2026-03-31
- Scope: 最新 80 コミット

## 更新ルール

- 仕様変更を含むコミット後は `npm run changelog:update` を実行する。
- 仕様書の更新日は、この changelog と合わせる。

## Git History Snapshot

### 2026-03-31
- Record branch layout for release, AI, and SRS work (`6c50e7d`)
### 2026-03-30
- Rewrite README around design philosophy (`9d86820`)
- Prepare public-facing README draft (`ce3bbc6`)
- Tidy settings hierarchy for checkbox override (`e8aecd7`)
- Stabilize legacy routine test expectations (`859f0a0`)
- Document planned-start parsing and sidebar behavior (`b8403c0`)
- Refresh bundle for sidebar time parsing (`5234e02`)
- Parse leading 4-digit task times in sidebar logic (`f8b6021`)
- Refresh bundle for start token detection (`469a14a`)
- Tighten planned start token detection (`296e855`)
- Refresh bundle for planned start handling (`389afbc`)
- Preserve planned starts for unchecked tasks (`889a391`)
- Refresh built bundle for quick input parsing (`f74fa51`)
- Loosen start parsing for quick task input (`055556b`)
- Handle dash-prefixed task starts consistently (`702f417`)
### 2026-03-08
- Align sidebar timeline with day cutoff (`ac5bc05`)
- Adjust done-state visual treatment (`a693855`)
- Rename default routine folder to routine (`399cb41`)
### 2026-03-07
- Unify debug log storage and include pending routine updates (`9b94b8c`)
- Fix routine folder suggest confirmation flow on mobile (`3914c30`)
### 2026-03-06
- Snapshot current workspace changes (`aaf287f`)
### 2026-03-05
- Improve summary view daily-note opening behavior (`6100104`)
- Fix completed-toggle duplication flow and duration drift handling (`d50c4f3`)
### 2026-03-02
- Add defer-to-tomorrow task flow (`0de5bcc`)
- Tune sidebar auto-scroll behavior (`c838929`)
- Add start_before lead-window support (`5ca1f2b`)
### 2026-03-01
- Tighten enlarged checkbox marker alignment (`659cca5`)
- Add mobile checkbox sizing toggle (`daf841f`)
### 2026-02-28
- Commit remaining task format and debug updates (`62602f8`)
- Tighten previous-completion start alignment (`c978eec`)
- Add reserved-start tail in summary view (`ac536d9`)
- Adopt start frontmatter and remove sidebar warning tint (`7660963`)
### 2026-02-27
- Simplify sidebar into past and future flows (`fc719e5`)
- Refactor summary presentation model and sidebar docs (`8da4877`)
- Keep trailing space when taskifying empty lines (`efec878`)
- Document local runtime paths (`b3c1df9`)
- Tighten mobile checkbox hit testing and debug notices (`938ee81`)
- Implement rollover overrides and AI commit logging (`68c1d88`)
- Refine checkbox reset behavior and debug logging (`671b2f7`)
- Flatten docs library and localize document names (`04971bd`)
- Skip vault fixture test when local tc files are missing (`e70e7ce`)
- Refine task quick-input parsing and use > for actuals (`31696ab`)
### 2026-02-26
- Simplify toggle behavior and add retro complete command (`f997371`)
- Reorganize docs around index-first navigation (`d7c6690`)
- Add smart adjust-time command and refine command icons (`f570e19`)
- Refine task command UX and interrupt completion display (`6055ca7`)
- Fix routine completion detection and task duplication behavior (`1d6269b`)
- Add sleep-aware summary header estimates (`931f85e`)
- Enhance summary sidebar sections and timing cues (`98c91ff`)
- Refine routine schedule anchors and JP shorthand (`becf067`)
- Add configurable routine section headings (`e62d79b`)
- Add daily note template marker routine auto-insert (`b36b215`)
- Reduce routine debug noise for non-routine tc files (`91a4b4b`)
- Rework checkbox interactions and harden plugin sync (`5ca15ba`)
- Handle repeat none in routine engine and add completion fixture tests (`c7163fa`)
- Support repeat zero and validate real tc repeats (`727040f`)
- Add actionable data extraction docs (`d7e97a2`)
- Add repeat shorthand parsing and Japanese shortcuts (`b0e5720`)
- Update routine repeat spec shorthand examples (`f1a7ca4`)
- Add debug mode tracing and fix routine update over-triggering (`6583567`)
### 2026-02-23
- Align sidebar metric labels and update spec (`0c9cc6a`)
- Document and refine summary sidebar interactions (`c26d48e`)
- Polish summary task list visual rhythm (`808c58f`)
- Refine summary sidebar header and list styling (`31d3163`)
- style(sidebar): upgrade header aesthetics to metric-card design (`4c8e938`)
- feat(sidebar): implement dynamic time stacking based on estimates (`54952a8`)
- style: minor adjustment to whitespace in task name (`83c6c69`)
- style: refine mobile sidebar layout for better visual grouping (`6c44baf`)
- perf: improve sidebar rendering to prevent flicker and optimize update triggers (`348ac9b`)
- fix: resolve mobile sidebar display and interaction issues (`50f402a`)
- Remove interrupted status and switch to pause-and-duplicate flow (`f02088b`)
- Align summary docs with current sidebar implementation (`2ce5dc6`)
- Refine summary view behavior and update sidebar spec (`857da5a`)
### 2026-02-22
- docs: finalize sidebar summary view specification and update implementation plan (`e681fce`)
- feat: implement initial summary view in sidebar (`e30e73d`)
- feat: refine routine engine with reactive monitoring, auto-completion, and none/no support (`197539d`)
- feat: enhance routine engine with advanced edge cases, deduplication, and indent support (`6a98ffe`)
- feat: implement routine engine refinement with multiple links, folder restriction and fallback (`048ad8c`)
- docs: update routine engine spec and implementation plan based on user feedback (`0d746d3`)

