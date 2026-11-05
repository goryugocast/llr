import { Component } from 'obsidian';
import type { ReflectionExpansionState } from '../service/reflection-expansion';
import type { ReflectionTask } from '../service/reflection-timeline';

export interface ReflectionTaskRenderOptions {
    expansion: ReflectionExpansionState;
    renderMarkdown: (element: HTMLElement, markdown: string, component: Component) => Promise<void>;
    registerDetails: (
        details: HTMLDetailsElement,
        summary: HTMLElement,
        key: string,
        setOpen: (open: boolean) => Promise<void>,
    ) => void;
}

const stripTaskIndent = (text: string): string => {
    const lines = text.split('\n');
    const indents = lines.filter(line => line.trim()).map(line => line.match(/^[ \t]*/)?.[0].length ?? 0);
    const indent = indents.length ? Math.min(...indents) : 0;
    return lines.map(line => line.slice(Math.min(indent, line.match(/^[ \t]*/)?.[0].length ?? 0))).join('\n');
};

const recordAnchor = (day: { date: string }, task: ReflectionTask, occurrence: number): string =>
    `${day.date}:record:${task.actualStart}:${task.actualEnd}:${task.title}:${occurrence}`;

/** Render one source task in the LLR sidebar's time, duration bar, title order. */
export async function renderReflectionTask(
    parent: HTMLElement,
    day: { date: string },
    task: ReflectionTask,
    occurrence: number,
    component: Component,
    options: ReflectionTaskRenderOptions,
): Promise<void> {
    const anchor = recordAnchor(day, task, occurrence);

    if (task.kind === 'memo') {
        const memo = parent.createDiv('llr-reflection-task-entry llr-reflection-task-memo-only');
        memo.dataset.anchor = anchor;
        await options.renderMarkdown(memo.createDiv('llr-reflection-task-memo llr-reflection-supplement'), task.supplement, component);
        return;
    }

    const hasMemo = !!task.supplement.trim();
    const key = `${day.date}:task:${task.actualStart}:${task.actualEnd}:${task.title}:${occurrence}`;
    const entry = hasMemo
        ? parent.createEl('details', { cls: 'llr-reflection-task-entry llr-reflection-task-details' })
        : parent.createDiv('llr-reflection-task-entry');
    let header: HTMLElement;
    if (hasMemo) {
        const details = entry as HTMLDetailsElement;
        const summary = details.createEl('summary', { cls: 'llr-item-self llr-reflection-task-heading' });
        summary.dataset.anchor = anchor;
        header = summary;
    } else {
        header = entry.createDiv('llr-item-self llr-reflection-task-heading');
        header.dataset.anchor = anchor;
    }

    const start = task.actualStart;
    const end = task.actualEnd;
    if (start) {
        const rowTop = header.createDiv('llr-row-top');
        const time = end && end !== start ? `${start} - ${end}` : start;
        rowTop.createSpan({ cls: 'llr-time', text: time });
        const duration = task.startMinute !== null && task.endMinute !== null
            ? Math.max(0, task.endMinute - task.startMinute)
            : 0;
        if (duration > 0) {
            const bar = rowTop.createDiv('llr-bar-wrap');
            bar.createDiv('llr-bar-fill').style.width = `${Math.min(100, duration / 120 * 100)}%`;
        }
    }

    const rowBottom = header.createDiv('llr-row-bottom');
    const name = rowBottom.createDiv('llr-task-name llr-reflection-task-name');
    await options.renderMarkdown(name, task.title || '(無題)', component);

    if (!hasMemo) return;
    const details = entry as HTMLDetailsElement;
    details.open = options.expansion.isOpen(key);
    let bodyComponent: Component | null = null;
    const fill = async () => {
        header.setAttribute('aria-expanded', String(details.open));
        if (bodyComponent) {
            component.removeChild(bodyComponent);
            bodyComponent = null;
        }
        entry.querySelector('.llr-reflection-task-memo')?.remove();
        if (details.open) {
            bodyComponent = component.addChild(new Component());
            await options.renderMarkdown(
                entry.createDiv('llr-reflection-task-memo llr-reflection-supplement'),
                stripTaskIndent(task.supplement),
                bodyComponent,
            );
        }
    };
    await fill();
    options.registerDetails(details, header, key, async open => {
        if (details.open === open) return;
        details.open = open;
        await fill();
    });
}
