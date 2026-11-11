// Opt-in integration checks against the running Obsidian deployment.
// Uses synthetic content, opens no note, and removes its temporary DOM/components.
import { execFileSync } from 'node:child_process';

async function checkReflectionRuntime() {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const unified = app.workspace.getLeavesOfType('llr-summary-view')[0]?.view;
    const view = unified?.timeline ?? app.workspace.getLeavesOfType('llr-reflection-view')[0]?.view;
    assert(view, 'Open the reflection tab before running these checks.');
    if (unified?.timeline === view) {
        assert(unified.containerEl.parentElement.querySelectorAll(':scope > .workspace-leaf-content').length === 1, 'Embedded renderers must not leave empty sibling panes that consume height.');
        assert(getComputedStyle(view.contentEl).padding === '0px', 'Embedded renderers must not add native padding a second time.');
    }
    await view.pending;
    const navigation = view.contentEl.querySelector('.llr-reflection-toolbar');
    const picker = view.contentEl.querySelector('.llr-reflection-date-picker');
    assert(picker && Math.abs(picker.getBoundingClientRect().height - view.currentDayLabel.getBoundingClientRect().height) < 1, 'The date picker input must not add an invisible second row to navigation.');
    assert(getComputedStyle(view.dateInput).position === 'absolute' && getComputedStyle(view.dateInput).opacity === '0', 'The native date input must not duplicate the visible date or occupy navigation space.');
    assert(getComputedStyle(view.currentDayLabel).alignItems === 'center', 'The date text must share the vertical center of the other controls.');
    const controls = [view.currentDayLabel, ...navigation.querySelectorAll('.llr-nav-btn,.llr-display-switch'), view.expandButton].filter(el => !el.hidden);
    const centers = controls.map(el => { const rect = el.getBoundingClientRect(); return rect.top + rect.height / 2; });
    assert(Math.max(...centers) - Math.min(...centers) < 1, 'Date, navigation and bulk controls must share one vertical center.');
    assert(view.expandButton.querySelector('svg.lucide-move-vertical'), 'Bulk expansion must use the same vertical movement icon as Backlinks.');
    assert(!view.contentEl.querySelector('.llr-reflection-calendar-picker'), 'Date selection must not have a separate calendar button.');
    assert(!view.currentDayLabel.disabled, 'The date picker must remain usable on days without a note.');
    const originalPicker = view.dateInput.showPicker;
    const originalFocus = document.activeElement;
    let pickerCalls = 0;
    try {
        view.dateInput.showPicker = () => { pickerCalls++; };
        view.currentDayLabel.click();
        assert(pickerCalls === 1, 'Clicking the date must open the date picker.');
    } finally {
        view.dateInput.showPicker = originalPicker;
        if (originalFocus instanceof HTMLElement) originalFocus.focus({ preventScroll: true });
    }
    // Reuse the public Component class already present in this Obsidian runtime.
    let prototype = view;
    while (prototype && !Object.prototype.hasOwnProperty.call(prototype, 'registerDomEvent')) prototype = Object.getPrototypeOf(prototype);
    assert(prototype, 'Obsidian Component is unavailable.');
    let component = view.addChild(new prototype.constructor());
    const childCount = view._children.length;
    const originalAnchor = view.anchor;
    const originalScrollRevision = view.userScrollRevision;
    const date = '1900-01-01';
    const key = `${date}:block:600:0`;
    const host = document.createElement('section');
    host.className = 'llr-reflection';
    host.style.cssText = 'position:fixed;left:-10000px;width:600px;';
    host.style.fontSize = getComputedStyle(view.scroller).fontSize;
    host.style.lineHeight = getComputedStyle(view.scroller).lineHeight;
    document.body.append(host);
    const originalExpansion = view.expansion;
    const originalDaysEl = view.daysEl;
    const originalExpandButton = view.expandButton;
    const originalButtonHTML = originalExpandButton?.innerHTML;
    const originalButtonDisabled = originalExpandButton?.disabled;
    const expansion = new originalExpansion.constructor();
    view.expansion = expansion;
    view.daysEl = host;
    view.expandButton = document.createElement('button');
    const originalOpen = app.workspace.openLinkText;
    let requestedLink = null;
    app.workspace.openLinkText = function(target, source, newLeaf) {
        if (target === 'Reflection test reference') {
            requestedLink = { target, source, newLeaf };
            return Promise.resolve();
        }
        return originalOpen.apply(this, arguments);
    };
    try {
        const day = { date, file: null };
        const makeTask = (id, startMinute, title, supplement) => ({
            id, kind: 'task', line: id, sourceLine: id + 1,
            title, status: 'x', actualStart: '10:00', actualEnd: '10:30',
            startMinute, endMinute: startMinute + 30, source: '', supplement,
        });
        const task = makeTask(0, 600, '[[Reflection test reference|見出しの別名]]', 'インデントなしの**大切なメモ**\n\n次の段落と[[Reflection test reference|補足の別名]]。\n\n- [x] 読んだ\n- [ ] 後で読む\n\n```md\n[[コード中の記法]]\n- [x] example\n```');
        const block = { id: 0, title: task.title, startMinute: 600, endMinute: 780, tasks: [task] };
        const responsive = host.createDiv('llr-reflection');
        responsive.style.width = '314px';
        const responsiveScroll = responsive.createDiv('llr-reflection-scroll');
        await view.makeBlock(responsiveScroll, day, { ...block, id: 99 }, 99, component);
        const responsiveRow = responsive.querySelector('.llr-reflection-row');
        const responsiveSummary = responsive.querySelector('summary');
        const responsiveName = responsive.querySelector('.llr-reflection-name');
        assert(getComputedStyle(responsiveScroll).fontSize === '15px', 'Timeline names must use the shared 15px activity text size.');
        assert(Math.abs(responsiveName.getBoundingClientRect().left - responsive.getBoundingClientRect().left - 40) < 1, 'Narrow panes must reserve the time-label column and clearance before the title.');
        assert(Math.abs(responsiveRow.getBoundingClientRect().height - view.hourHeight() * 3) < 1, 'Narrow panes must keep the same hour scale for all three hours.');
        responsive.style.width = '700px';
        assert(getComputedStyle(responsiveScroll).fontSize === getComputedStyle(responsive).fontSize, 'Wide panes must keep native note typography.');
        assert(Math.abs(responsiveName.getBoundingClientRect().left - responsive.getBoundingClientRect().left - 40) < 1, 'Wide panes must retain the independent time-label column.');
        assert(Math.abs(responsiveRow.getBoundingClientRect().height - view.hourHeight() * 3) < 1, 'Resizing must update the hour scale without redrawing the records.');
        for (const width of [282, 300, 322, 400, 522]) {
            responsive.style.width = `${width}px`;
            for (const label of responsive.querySelectorAll('.llr-reflection-axis-label')) {
                if (!label.textContent) continue;
                const labelRect = label.getBoundingClientRect();
                const row = label.closest('.llr-reflection-row');
                const surfaceLeft = row.getBoundingClientRect().left + parseFloat(getComputedStyle(row, '::before').left);
                assert(surfaceLeft - labelRect.right >= 7.9, `Time labels need a clear lane before the activity surface at ${width}px.`);
                const range = document.createRange();
                range.selectNodeContents(label);
                const textRect = range.getBoundingClientRect();
                assert(textRect.left >= labelRect.left - 0.5 && textRect.right <= labelRect.right + 0.5, 'The full hour digits must fit within their lane.');
            }
        }
        responsive.remove();
        const secondTask = makeTask(1, 780, '別の記録', '二つ目の本文');
        const secondBlock = { id: 1, title: secondTask.title, startMinute: 780, endMinute: 840, tasks: [secondTask] };
        const firstKey = key;
        const secondKey = `${date}:block:780:0`;
        await view.makeBlock(host, day, block, 0, component);
        await view.makeBlock(host, day, secondBlock, 0, component);
        let details = host.querySelector('details');
        assert(details && !details.open, 'Details must begin collapsed.');
        assert(host.querySelectorAll('.llr-reflection-count').length === 0, 'The redundant task count UI must be removed.');
        const headingLink = host.querySelector('.llr-reflection-name a');
        assert(headingLink?.textContent === '見出しの別名', 'The representative title must remain a rendered note link in the activity heading.');
        assert(headingLink?.getAttribute('data-href') === 'Reflection test reference', 'The activity heading link must preserve its wiki target.');
        assert(host.querySelector('.llr-reflection-name')?.closest('summary')?.querySelector('input[type="checkbox"]') === null, 'The collapsed heading must not expose task status checkboxes.');
        const steps = [...host.querySelectorAll('.llr-reflection-row:first-child .llr-reflection-axis-tick')];
        assert(steps.length === 3 && steps.map(step => step.textContent).join(',') === '10,,12', 'Axis labels must be plain hour numbers every two hours.');
        const top = element => element.getBoundingClientRect().top;
        assert(Math.abs(top(steps[1]) - top(steps[0]) - view.hourHeight()) < 1 && Math.abs(top(steps[2]) - top(steps[1]) - view.hourHeight()) < 1, 'Collapsed hourly positions must remain equally spaced, including unlabeled hours.');
        assert(Math.abs(host.querySelector('.llr-reflection-row').getBoundingClientRect().height - 3 * view.hourHeight()) < 1, 'A three-hour overview must occupy exactly three cells.');
        assert(!host.querySelector('.llr-reflection-duration'), 'Representative headings must not duplicate actual duration metadata.');
        assert(steps.every(step => !step.querySelector('.llr-reflection-continuation-name')), 'Continued hours must not repeat the activity heading.');
        assert(getComputedStyle(host.querySelector('.llr-reflection-row'), '::before').left === '32px', 'The activity surface must begin after the independent time axis.');
        assert(getComputedStyle(host.querySelector('.llr-reflection-row'), '::after').content === 'none', 'The activity must not be enclosed by a continuation bracket.');
        const disclosure = host.querySelector('.llr-reflection-disclosure-icon');
        assert(disclosure?.querySelector('svg.lucide-chevron-down'), 'Each activity heading must expose the shared disclosure chevron.');
        assert(disclosure.getBoundingClientRect().width === 16 && disclosure.getBoundingClientRect().height === 16, 'The disclosure chevron must occupy a 16px control area.');
        assert(disclosure.getBoundingClientRect().left >= host.querySelector('.llr-reflection-name').getBoundingClientRect().right, 'The disclosure chevron must remain outside the activity name.');
        assert(host.querySelector('.llr-reflection-row').classList.contains('is-collapsed'), 'A collapsed block must expose one whole-block hover target.');
        assert(host.querySelectorAll('.llr-reflection-record').length === 0, 'Collapsed details must not render their bodies.');
        headingLink.click();
        assert(requestedLink?.target === 'Reflection test reference' && !details.open, 'Following a collapsed heading link must navigate without opening the activity.');
        const childrenWhileClosed = component._children.length;
        steps[1].click();
        await view.pending;
        assert(details.open && expansion.isOpen(firstKey), 'Clicking the continued-hour area must open the whole block.');
        const openedRow = details.closest('.llr-reflection-row');
        const firstGap = top(steps[1]) - top(steps[0]), secondGap = top(steps[2]) - top(steps[1]);
        const nextTick = host.querySelector('.llr-reflection-axis-tick[data-minute="780"]');
        assert(Math.abs(firstGap - secondGap) < 1 && Math.abs(top(nextTick) - top(steps[2]) - firstGap) < 1, 'Expansion must spread all three hourly intervals uniformly through the next activity boundary.');
        assert(Math.abs(openedRow.getBoundingClientRect().height - Math.max(3 * view.hourHeight(), details.getBoundingClientRect().height)) < 1, 'Expansion must not add the original duration as empty tail space after the memo.');
        assert(!host.querySelector('.llr-reflection-row').classList.contains('is-collapsed'), 'Reading the opened memo must not imply a whole-body toggle target.');
        steps[1].click();
        await view.pending;
        assert(details.open, 'Continued-hour clicks must not collapse an open reading area.');
        const renderedRecord = host.querySelector('.llr-reflection-record');
        assert(!renderedRecord.querySelector('.llr-reflection-record-title'), 'The representative title must not be repeated after expansion.');
        assert(host.querySelector('.llr-reflection-supplement strong')?.textContent === '大切なメモ', 'Memo Markdown must render rather than show raw syntax.');
        assert(host.querySelectorAll('.llr-reflection-supplement > p').length >= 2, 'Multi-paragraph memos must retain separate paragraphs.');
        assert(host.querySelector('.llr-reflection-supplement a')?.textContent === '補足の別名', 'Memo wiki alias must render as a link.');
        assert(host.querySelector('code')?.textContent.includes('[[コード中の記法]]'), 'Fenced examples must remain literal.');
        const boxes = [...host.querySelectorAll('input[type="checkbox"]')];
        assert(boxes.length === 2 && boxes.every(box => box.disabled), 'Nested memo checkboxes must be native and read-only.');
        assert(!host.querySelector('.llr-reflection-source'), 'Records must not repeat a redundant daily-note navigation control.');
        assert(renderedRecord.querySelector('.llr-reflection-record-time')?.parentElement === renderedRecord, 'Actual times must sit beneath the title instead of creating a wide title column.');
        const checkedBefore = boxes.map(box => box.checked).join(',');
        boxes.forEach(box => box.click());
        assert(boxes.map(box => box.checked).join(',') === checkedBefore, 'Read-only controls must not toggle.');
        host.querySelector('.llr-reflection-supplement').click();
        await view.pending;
        assert(details.open, 'Selecting or clicking memo text must not collapse the reading area.');
        headingLink.click();
        assert(requestedLink?.target === 'Reflection test reference' && requestedLink.newLeaf === 'tab', 'Wiki links must dispatch tab navigation.');
        assert(details.open, 'Following a title link must not collapse details.');

        // The clock and plain title each toggle the entire native detail row.
        host.querySelector('.llr-reflection-hour').click();
        await view.pending;
        assert(!details.open, 'Clicking the summary clock must collapse the detail.');
        host.querySelector('.llr-reflection-name').click();
        await view.pending;
        assert(details.open, 'Clicking the summary title must expand the detail.');

        // A redraw retains individual exceptions before any global operation.
        view.removeChild(component);
        component = view.addChild(new prototype.constructor());
        host.empty();
        await view.makeBlock(host, day, block, 0, component);
        await view.makeBlock(host, day, secondBlock, 0, component);
        details = host.querySelector('details');
        assert(details.open && !host.querySelectorAll('details')[1].open, 'Individual detail state must survive a redraw.');
        assert(host.querySelector('.llr-reflection-supplement'), 'The reopened memo must render after a redraw.');

        // Global expansion opens every visible details and updates the button.
        await view.setAllDetails(true);
        assert(expansion.isOpen('later-key') && !expansion.shouldOpenAll([firstKey, secondKey]), 'New keys must inherit open-all mode.');
        assert([...host.querySelectorAll('details')].every(item => item.open), 'Global expansion must open all visible details.');
        assert(host.querySelectorAll('.llr-reflection-record').length === 2, 'Global expansion must render every body.');
        assert(view.expandButton.getAttribute('aria-label') === 'すべて折りたたむ', 'The global button must offer closing when all details are open.');
        host.querySelectorAll('details')[1].querySelector('summary').click();
        await view.pending;
        assert(!host.querySelectorAll('details')[1].open && host.querySelector('details').open, 'An individual close must leave other details open.');
        assert(view.expandButton.getAttribute('aria-label') === 'すべて展開', 'One closed detail must make the global button offer opening.');
        await view.setAllDetails(true);
        assert([...host.querySelectorAll('details')].every(item => item.open), 'Global expansion must reopen all details.');
        assert(view.expandButton.getAttribute('aria-label') === 'すべて折りたたむ', 'The button must return to the close action.');
        const thirdTask = makeTask(2, 840, '追加の記録', '追加本文');
        const thirdBlock = { id: 2, title: thirdTask.title, startMinute: 840, endMinute: 900, tasks: [thirdTask] };
        await view.makeBlock(host, day, thirdBlock, 0, component);
        assert(host.querySelectorAll('details')[2].open, 'A newly rendered detail must follow the current open-all mode.');
        assert(view.expandButton.getAttribute('aria-label') === 'すべて折りたたむ', 'Adding an open detail must preserve the close action.');
        await view.setAllDetails(false);
        assert(!expansion.isOpen('later-key') && expansion.shouldOpenAll([firstKey, secondKey]), 'New keys must inherit close-all mode.');
        assert([...host.querySelectorAll('details')].every(item => !item.open), 'Global collapse must close every visible detail.');
        assert(host.querySelectorAll('.llr-reflection-record').length === 0, 'Global collapse must release all rendered bodies.');
        assert(view.expandButton.getAttribute('aria-label') === 'すべて展開', 'The global button must offer opening after collapse.');

        // Reconstructing a block after a global collapse must stay closed.
        view.removeChild(component);
        component = view.addChild(new prototype.constructor());
        host.empty();
        await view.makeBlock(host, day, block, 0, component);
        details = host.querySelector('details');
        assert(!details.open && !host.querySelector('.llr-reflection-record'), 'A redraw after global collapse must remain closed.');
        details.querySelector('summary').click();
        await view.pending;
        assert(details.open && host.querySelector('.llr-reflection-supplement'), 'Individual expansion and memo content must work after redraw.');
        details.querySelector('summary').click();
        await view.pending;
        assert(!details.open && !host.querySelector('.llr-reflection-record'), 'Collapse must release the rendered body.');
        assert(!expansion.isOpen(firstKey), 'Individual collapse must be remembered.');

        // Exercise the real SummaryView renderer in a detached synthetic host. No
        // summary/app state is changed and no note-opening or vault API is invoked.
        const summary = unified?.summary;
        assert(summary, 'The unified task summary is unavailable.');
        const summaryHost = document.createElement('section');
        summaryHost.className = 'llr-summary-container llr-unified-view';
        summaryHost.style.cssText = `position:fixed;left:-10000px;top:0;width:360px;height:800px;overflow:hidden;font-family:${getComputedStyle(summary.contentEl).fontFamily};`;
        document.body.append(summaryHost);
        const summaryRenderer = Object.create(Object.getPrototypeOf(summary));
        Object.assign(summaryRenderer, {
            currentDate: summary.currentDate.clone(),
            delegate: summary.delegate,
            targetFile: summary.targetFile,
        });
        let dateChanged = null;
        let noteOpened = null;
        summaryRenderer.setDisplayDate = async date => { dateChanged = date; };
        summaryRenderer.openDateNote = date => { noteOpened = date; };
        const summaryData = {
            header: { date: '2026-11-11', total: '1h 30m', end: '16:30', wake: '00:30' },
            pastGroups: [],
            futureGroups: [{ sectionLabel: null, showSection: false, items: [
                { text: '🧩 [[Design|設計レビュー]] のあと長い実行中タスク名', displayText: '🧩 [[Design|設計レビュー]] のあと長い実行中タスク名', times: ['09:00', '09:30'], estimate: '30m', line: 1, status: '[/]', isDone: false, isRunning: true, duration: 30, displayStartTime: '09:00', displayEndTime: '09:30', role: 'running' },
                { text: '📅 [[Meeting|会議]]の準備', displayText: '📅 [[Meeting|会議]]の準備', times: ['10:00'], estimate: '30m', line: 2, status: '[-]', isDone: false, isRunning: false, duration: 30, displayStartTime: '10:15', displayEndTime: '10:45', role: 'future' },
                { text: '資料を読み返す', displayText: '資料を読み返す', times: ['11:00', '11:15'], estimate: '15m', line: 3, status: 'x', isDone: true, isRunning: false, duration: 15, displayStartTime: '11:00', displayEndTime: '11:15', role: 'done' },
                { text: '次の作業を整理する', displayText: '次の作業を整理する', times: ['11:15', '11:30'], estimate: '15m', line: 4, status: 'x', isDone: true, isRunning: false, duration: 15, displayStartTime: '11:15', displayEndTime: '11:30', role: 'done' },
            ] }],
            hiddenItems: [],
        };
        const previousFocus = document.activeElement;
        try {
            summaryRenderer.renderHeader(summaryHost, summaryData);
            summaryRenderer.renderList(summaryHost, summaryData);
            const dateButton = summaryHost.querySelector('.llr-date-label');
            const dateInput = summaryHost.querySelector('.llr-reflection-date-input');
            const originalShowPicker = dateInput.showPicker;
            let pickerOpened = false;
            dateInput.showPicker = () => { pickerOpened = true; };
            try {
                dateButton.click();
                assert(pickerOpened, 'Clicking the SummaryView date must open its native picker.');
                dateInput.value = '2026-11-12';
                dateInput.dispatchEvent(new Event('change'));
                assert(dateChanged === '2026-11-12' && noteOpened === null, 'Changing the selected day must move the display date without opening a note.');
            } finally {
                dateInput.showPicker = originalShowPicker;
            }
            const dateControls = summaryHost.querySelector('.llr-summary-date-nav');
            const tools = summaryHost.querySelector('.llr-display-tools');
            for (const width of [280, 320, 520]) {
                summaryHost.style.width = `${width}px`;
                const leftRect = dateControls.getBoundingClientRect();
                const rightRect = tools.getBoundingClientRect();
                assert(rightRect.left + 1 >= leftRect.right, `Summary controls must not overlap at ${width}px.`);
                const infoBoxes = [...summaryHost.querySelectorAll('.llr-info-box')].map(box => box.getBoundingClientRect());
                const firstLabel = summaryHost.querySelector('.llr-info-label').getBoundingClientRect();
                const firstValue = summaryHost.querySelector('.llr-info-value').getBoundingClientRect();
                const firstTask = summaryHost.querySelector('.llr-task-name').getBoundingClientRect();
                assert(Math.abs(firstLabel.left - firstTask.left) < 1 && Math.abs(firstValue.left - firstTask.left) < 1, `Summary labels and values must share the task text edge at ${width}px.`);
                assert(summaryHost.querySelectorAll('.llr-info-value')[1].textContent === '16:30', 'The finish estimate must omit the sleep-adjusted wake time.');

                assert(infoBoxes[0].right <= infoBoxes[1].left + 1, `The 1h 30m summary columns must not overlap at ${width}px.`);
                assert(infoBoxes[1].left - infoBoxes[0].right <= 29, `Summary estimates must remain one compact group rather than spread across a wide pane at ${width}px.`);
            }
            const taskNames = [...summaryHost.querySelectorAll('.llr-task-name')];
            const taskRows = [...summaryHost.querySelectorAll('.llr-item-self')];
            assert(taskNames.length === 4 && taskRows.every(row => row.children[0]?.classList.contains('llr-row-bottom') && row.children[1]?.classList.contains('llr-row-top')), 'Task names must precede their time and bar rows.');
            assert(taskNames.every(name => getComputedStyle(name).fontSize === '15px'), 'Summary task names must use the shared 15px activity typography.');
            assert(taskRows.every(row => getComputedStyle(row).gap === '4px' && getComputedStyle(row).paddingTop === '8px' && getComputedStyle(row).paddingBottom === '8px'), 'Summary task rows must keep the shared 4px gap and 8px vertical inset.');
            const bars = [...summaryHost.querySelectorAll('.llr-bar-wrap')];
            assert(bars.every(bar => getComputedStyle(bar).height === '2px' && parseFloat(getComputedStyle(bar).maxWidth) <= 92), 'Summary duration bars must remain 2px high and no wider than 92px.');
            const rowRects = taskRows.map(row => row.getBoundingClientRect());
            assert(rowRects.every((rect, index) => index === 0 || rowRects[index - 1].bottom <= rect.top + 1), 'Aggregated task rows must not overlap.');
        } finally {
            if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
            summaryHost.remove();
        }
        // The removed native body component must unload rather than accumulate.
        assert(component._children.length === childrenWhileClosed, 'Collapse must dispose the rendered body component.');
        assert(!view.daysEl.querySelector('.llr-reflection-record'), 'The fixture must release rendered bodies before cleanup.');
        // A scrollbar pointer gesture during asynchronous rendering must win
        // over the bulk operation's attempt to restore its earlier position.
        const controller = view.detailSetters.get(details);
        const originalSetter = controller.setOpen;
        const originalRestore = view.restoreAnchor;
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        let restoreCalls = 0;
        controller.setOpen = async open => { await gate; await originalSetter(open); };
        view.restoreAnchor = () => { restoreCalls++; };
        try {
            const opening = view.setAllDetails(true);
            view.scroller.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
            release();
            await opening;
            assert(restoreCalls === 0, 'A scrollbar gesture during bulk rendering must prevent restoring an obsolete position.');
        } finally {
            release();
            controller.setOpen = originalSetter;
            view.restoreAnchor = originalRestore;
        }
        await view.setAllDetails(false);
        // Standalone point records must remain readable without stretching elapsed time.
        const originalRead = app.vault.cachedRead;
        const fixtureFile = { path: '__llr_axis_runtime_fixture__.md' };
        let fixtureSection;
        let fixtureText = '- [x] 活動 10:00 - 11:00\n- [x] 時刻のみ 12:30 - 12:30\n- [x] 時刻なし';
        app.vault.cachedRead = function(file) {
            if (file === fixtureFile) return Promise.resolve(fixtureText);
            return originalRead.apply(this, arguments);
        };
        try {
            fixtureSection = await view.makeDay({ date: '1900-01-02', file: fixtureFile });
            host.append(fixtureSection);
            const axis = fixtureSection.querySelector('.llr-reflection-axis');
            assert(!fixtureSection.querySelector('.llr-reflection-point-list'), 'Point records must not be isolated in a confusing separate category.');
            assert(!fixtureSection.querySelector('.llr-reflection-untimed') && !fixtureSection.textContent.includes('時刻なし'), 'Untimed records must stay in source data but be omitted from the timeline display.');
            assert(!!axis.querySelector('.llr-reflection-axis-tick[data-minute="720"]'), 'A point record must appear in its own hourly overview.');
            assert(Math.abs(axis.getBoundingClientRect().height - 3 * view.hourHeight()) < 1, 'The overview must retain equal cells between the first and last recorded hours.');
            view.releaseDay(fixtureSection); fixtureSection.remove();
            fixtureText = '- [x] 睡眠 00:00 - 10:00\n  大切な日跨ぎメモ';
            fixtureSection = await view.makeDay({ date: '1900-01-02', file: fixtureFile });
            host.append(fixtureSection);
            assert(!fixtureSection.querySelector('.llr-reflection-duration'), 'The overview must not duplicate the full interval as summary metadata.');
            assert(Math.abs(fixtureSection.querySelector('.llr-reflection-axis').getBoundingClientRect().height - view.hourHeight() * 3) < 1, 'Cross-day overviews must stop at the next cutoff while retaining equal hourly cells.');
            const crossDetails = fixtureSection.querySelector('details');
            await view.detailSetters.get(crossDetails).setOpen(true);
            assert(fixtureSection.querySelectorAll('.llr-reflection-record').length === 1, 'Clipping an overview must keep its source record exactly once.');
            assert(fixtureSection.querySelector('.llr-reflection-record-time')?.textContent === '00:00–10:00', 'The original full actual interval must remain readable.');
            assert(fixtureSection.querySelector('.llr-reflection-supplement')?.textContent.includes('大切な日跨ぎメモ'), 'Cross-day memos must remain intact.');
        } finally {
            app.vault.cachedRead = originalRead;
            if (fixtureSection) { view.releaseDay(fixtureSection); fixtureSection.remove(); }
        }
        return { passed: true, checks: ['single-row date navigation without duplicate input', 'SummaryView rendering at 280/320/520px with non-overlapping controls and summary columns', 'Summary date picker changes the displayed date without opening a note', '15px summary activity names, title-first rows, shared 4px/8px spacing and 2px bars capped at 92px', '1h 30m aggregated task rows do not overlap',
            'narrow-pane typography, gutter and responsive hour geometry', 'linked representative heading and separate disclosure', 'uniform expansion geometry and two-hour labels', 'point records integrated into hourly overview', 'removed count UI', 'memo Markdown and paragraphs', 'literal code', 'readonly checklists', 'native body link dispatch', 'individual and global expansion interplay', 'new detail in open-all mode', 'redraw after global collapse', 'body disposal', 'manual scrollbar intent during bulk rendering'] };
    } finally {
        app.workspace.openLinkText = originalOpen;
        view.expansion = originalExpansion;
        view.daysEl = originalDaysEl;
        view.expandButton = originalExpandButton;
        if (originalExpandButton) {
            originalExpandButton.innerHTML = originalButtonHTML;
            originalExpandButton.disabled = originalButtonDisabled;
        }
        view.anchor = originalAnchor;
        view.userScrollRevision = originalScrollRevision;
        host.remove();
        view.removeChild(component);
        assert(view._children.length === childCount - 1, 'Temporary runtime-test components must be removed.');
    }
}

try {
    const code = `(${checkReflectionRuntime.toString()})().then(result => JSON.stringify(result))`;
    const output = execFileSync('obsidian', ['eval', `code=${code}`], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
    const json = output.split('\n').find(line => line.startsWith('=> '))?.slice(3);
    if (!json) throw new Error(output.trim() || 'Obsidian returned no result.');
    const result = JSON.parse(json);
    if (!result.passed) throw new Error('Runtime checks failed.');
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
    process.stderr.write(`Reflection runtime checks failed: ${error.message}\n`);
    process.exitCode = 1;
}
