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
    const date = '1900-01-01';
    const key = `${date}:block:600:0`;
    const wasExpanded = view.expanded.has(key);
    view.expanded.delete(key);
    const host = document.createElement('section');
    host.className = 'llr-reflection';
    host.style.cssText = 'position:fixed;left:-10000px;width:600px;';
    document.body.append(host);
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
        const task = {
            id: 0, kind: 'task', line: 0, sourceLine: 1,
            title: '[[Reflection test reference|見出しの別名]]', status: 'x',
            actualStart: '10:00', actualEnd: '10:30', startMinute: 600, endMinute: 630,
            source: '', supplement: 'インデントなしの**大切なメモ**\n\n次の段落と[[Reflection test reference|補足の別名]]。\n\n- [x] 読んだ\n- [ ] 後で読む\n\n```md\n[[コード中の記法]]\n- [x] example\n```',
        };
        const block = { id: 0, title: task.title, startMinute: 600, endMinute: 660, tasks: [task] };
        await view.makeBlock(host, day, block, 0, component);
        let details = host.querySelector('details');
        assert(details && !details.open, 'Details must begin collapsed.');
        assert(!host.querySelector('.llr-reflection-record'), 'Collapsed details must not render their body.');
        const childrenWhileClosed = component._children.length;
        details.querySelector('summary').click();
        await view.pending;
        assert(details.open && view.expanded.has(key), 'Individual expansion must be remembered.');
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

        // Reconstructing the same block is the path used when a day refreshes.
        view.removeChild(component);
        component = view.addChild(new prototype.constructor());
        host.empty();
        await view.makeBlock(host, day, block, 0, component);
        details = host.querySelector('details');
        assert(details.open && host.querySelector('.llr-reflection-supplement'), 'Expansion and memo content must survive rebuilding a block.');
        details.querySelector('summary').click();
        await view.pending;
        assert(!details.open && !host.querySelector('.llr-reflection-record'), 'Collapse must release the rendered body.');
        assert(!view.expanded.has(key), 'Individual collapse must be remembered.');
        // The removed native body component must unload rather than accumulate.
        assert(component._children.length === childrenWhileClosed, 'Collapse must dispose the rendered body component.');
        return { passed: true, checks: ['wiki aliases', 'memo Markdown and paragraphs', 'literal code', 'readonly checklists', 'link dispatch', 'individual opening and closing', 'expansion after redraw', 'body disposal'] };
    } finally {
        app.workspace.openLinkText = originalOpen;
        if (wasExpanded) view.expanded.add(key); else view.expanded.delete(key);
        view.anchor = originalAnchor;
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
