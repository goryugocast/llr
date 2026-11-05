import { Component } from 'obsidian';
import type { ReflectionTask } from '../service/reflection-timeline';

export interface ReflectionTaskRenderOptions {
    renderMarkdown: (element: HTMLElement, markdown: string, component: Component) => Promise<void>;
}

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
    // This mode mirrors the existing task sidebar. Memo-only records and task
    // supplements belong to the timeline, never to an extra task disclosure.
    if (task.kind === 'memo') return;
    const anchor = recordAnchor(day, task, occurrence);
    const entry = parent.createDiv('llr-reflection-task-entry');
    entry.toggleClass('llr-item-done', task.status === 'x');
    const header = entry.createDiv('llr-item-self llr-reflection-task-heading');
    header.dataset.anchor = anchor;

    const rowTop = header.createDiv('llr-row-top');
    rowTop.createSpan({ cls: 'llr-time', text: `${task.actualStart || '-'} - ${task.actualEnd || '-'}` });
    const duration = task.startMinute !== null && task.endMinute !== null
        ? Math.max(0, task.endMinute - task.startMinute)
        : 0;
    const bar = rowTop.createDiv('llr-bar-wrap');
    bar.createDiv('llr-bar-fill').style.width = `${Math.min(100, duration / 120 * 100)}%`;

    const rowBottom = header.createDiv('llr-row-bottom');
    const name = rowBottom.createDiv('llr-task-name llr-reflection-task-name');
    await options.renderMarkdown(name, task.title || '(無題)', component);
}
