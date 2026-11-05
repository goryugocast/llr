// Opt-in integration checks against the running Obsidian deployment.
// Uses synthetic content, opens no note, and removes its temporary DOM/components.
import { execFileSync } from 'node:child_process';

async function checkReflectionRuntime() {
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const view = app.workspace.getLeavesOfType('llr-reflection-view')[0]?.view;
    assert(view, 'Open the reflection tab before running these checks.');
    await view.pending;
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
    document.body.append(host);
    const originalExpansion = view.expansion;
    const originalDaysEl = view.daysEl;
    const originalExpandButton = view.expandButton;
    const originalButtonText = originalExpandButton?.textContent;
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
        const block = { id: 0, title: task.title, startMinute: 600, endMinute: 660, tasks: [task] };
        const secondTask = makeTask(1, 660, '別の記録', '二つ目の本文');
        const secondBlock = { id: 1, title: secondTask.title, startMinute: 660, endMinute: 720, tasks: [secondTask] };
        const firstKey = key;
        const secondKey = `${date}:block:660:0`;
        await view.makeBlock(host, day, block, 0, component);
        await view.makeBlock(host, day, secondBlock, 0, component);
        let details = host.querySelector('details');
        assert(details && !details.open, 'Details must begin collapsed.');
        assert(host.querySelectorAll('.llr-reflection-record').length === 0, 'Collapsed details must not render their bodies.');
        const childrenWhileClosed = component._children.length;
        details.querySelector('summary').click();
        await view.pending;
        assert(details.open && expansion.isOpen(firstKey), 'Individual expansion must be remembered.');
        assert(host.querySelector('.llr-reflection-name a')?.textContent === '見出しの別名', 'Representative wiki alias must render as a link.');
        assert(host.querySelector('.llr-reflection-record-title a')?.textContent === '見出しの別名', 'Task wiki alias must render as a link.');
        assert(host.querySelector('.llr-reflection-supplement strong')?.textContent === '大切なメモ', 'Memo Markdown must render rather than show raw syntax.');
        assert(host.querySelectorAll('.llr-reflection-supplement > p').length >= 2, 'Multi-paragraph memos must retain separate paragraphs.');
        assert(host.querySelector('.llr-reflection-supplement a')?.textContent === '補足の別名', 'Memo wiki alias must render as a link.');
        assert(host.querySelector('code')?.textContent.includes('[[コード中の記法]]'), 'Fenced examples must remain literal.');
        const boxes = [...host.querySelectorAll('input[type="checkbox"]')];
        assert(boxes.length === 3 && boxes.every(box => box.disabled), 'Activity and memo checkboxes must be native and read-only.');
        const checkedBefore = boxes.map(box => box.checked).join(',');
        boxes.forEach(box => box.click());
        assert(boxes.map(box => box.checked).join(',') === checkedBefore, 'Read-only controls must not toggle.');
        host.querySelector('.llr-reflection-name a').click();
        assert(requestedLink?.target === 'Reflection test reference' && requestedLink.newLeaf === 'tab', 'Wiki links must dispatch tab navigation.');
        assert(details.open, 'Following a title link must not collapse details.');

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
        assert(view.expandButton.textContent === '全部閉じる', 'The global button must offer closing when all details are open.');
        host.querySelectorAll('details')[1].querySelector('summary').click();
        await view.pending;
        assert(!host.querySelectorAll('details')[1].open && host.querySelector('details').open, 'An individual close must leave other details open.');
        assert(view.expandButton.textContent === '全部開く', 'One closed detail must make the global button offer opening.');
        await view.setAllDetails(true);
        assert([...host.querySelectorAll('details')].every(item => item.open), 'Global expansion must reopen all details.');
        assert(view.expandButton.textContent === '全部閉じる', 'The button must return to the close action.');
        const thirdTask = makeTask(2, 720, '追加の記録', '追加本文');
        const thirdBlock = { id: 2, title: thirdTask.title, startMinute: 720, endMinute: 780, tasks: [thirdTask] };
        await view.makeBlock(host, day, thirdBlock, 0, component);
        assert(host.querySelectorAll('details')[2].open, 'A newly rendered detail must follow the current open-all mode.');
        assert(view.expandButton.textContent === '全部閉じる', 'Adding an open detail must preserve the close action.');
        await view.setAllDetails(false);
        assert(!expansion.isOpen('later-key') && expansion.shouldOpenAll([firstKey, secondKey]), 'New keys must inherit close-all mode.');
        assert([...host.querySelectorAll('details')].every(item => !item.open), 'Global collapse must close every visible detail.');
        assert(host.querySelectorAll('.llr-reflection-record').length === 0, 'Global collapse must release all rendered bodies.');
        assert(view.expandButton.textContent === '全部開く', 'The global button must offer opening after collapse.');

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
        return { passed: true, checks: ['wiki aliases', 'memo Markdown and paragraphs', 'literal code', 'readonly checklists', 'link dispatch', 'individual and global expansion interplay', 'new detail in open-all mode', 'redraw after global collapse', 'body disposal', 'manual scrollbar intent during bulk rendering'] };
    } finally {
        app.workspace.openLinkText = originalOpen;
        view.expansion = originalExpansion;
        view.daysEl = originalDaysEl;
        view.expandButton = originalExpandButton;
        if (originalExpandButton) {
            originalExpandButton.textContent = originalButtonText;
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
