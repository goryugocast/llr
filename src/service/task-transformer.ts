import { calculateDuration, calculateEndTime } from './time-calculator';
import { ParsedTask, TaskParser } from './task-parser';

/**
 * Pure functions for task string transformations.
 * Decoupled from Obsidian API for testing.
 */

export interface TaskTransformResult {
    type: 'update' | 'insert' | 'complete' | 'none';
    content: string;
    extraContent?: string;
}

export type TaskAction = 'start' | 'complete' | 'duplicate' | 'retroComplete' | 'taskify';
export type CheckboxPressIntent = 'short' | 'long';
export interface CheckboxPressOptions {
    unstartedLongPressStartTime?: string;
}

export function transformTaskLine(
    lineText: string,
    now: Date,
    forceAction?: TaskAction
): TaskTransformResult | null {
    if (lineText.match(/^\s+/)) return null;

    const hasExplicitCheckbox = /^- \[( |\/|x)\]/.test(lineText);
    const timeStr = formatTime(now);

    if (forceAction) {
        return applyForcedAction(lineText, now, forceAction, { hasExplicitCheckbox, timeStr });
    }

    if (!hasExplicitCheckbox) {
        return {
            type: 'update',
            content: toUncheckedTaskLine(lineText),
        };
    }

    const parsed = TaskParser.parseLine(lineText);
    if (parsed.status === '/') return { type: 'complete', content: '' };
    if (parsed.status === 'x') return cloneResult(parsed, timeStr, { startImmediately: false });
    if (parsed.status === ' ') return buildStartResult(parsed, timeStr);

    return null;
}

function applyForcedAction(
    lineText: string,
    now: Date,
    forceAction: TaskAction,
    state: {
        hasExplicitCheckbox: boolean;
        timeStr: string;
    }
): TaskTransformResult | null {
    const { hasExplicitCheckbox, timeStr } = state;
    const parsed = hasExplicitCheckbox ? TaskParser.parseLine(lineText) : null;

    switch (forceAction) {
        case 'taskify':
            if (hasExplicitCheckbox) return null;
            return { type: 'update', content: toUncheckedTaskLine(lineText) };
        case 'retroComplete':
            return buildRetroCompleteResult(lineText);
        case 'duplicate':
            if (!parsed) return null;
            return cloneResult(parsed, timeStr, { startImmediately: false });
        case 'start':
            if (!parsed) {
                return { type: 'update', content: buildRunningLine(TaskParser.parseLine(toUncheckedTaskLine(lineText)), timeStr) };
            }
            if (parsed.status === '/') return null;
            if (parsed.status === 'x') return cloneResult(parsed, timeStr, { startImmediately: true });
            return { type: 'update', content: buildRunningLine(parsed, timeStr) };
        case 'complete':
            if (!parsed || parsed.status !== '/') return null;
            return { type: 'complete', content: '' };
        default:
            return null;
    }
}

function buildRetroCompleteResult(lineText: string): TaskTransformResult | null {
    const normalized = /^- \[( |\/|x)\]/.test(lineText) ? lineText : toUncheckedTaskLine(lineText);
    const parsed = TaskParser.parseLine(normalized);
    const estimateMinutes = getEstimateMinutes(parsed);
    const startTime = parsed.plannedStart;

    if (!estimateMinutes || !startTime) return null;

    const completed: ParsedTask = {
        ...parsed,
        status: 'x',
        actualStart: startTime,
        actualEnd: calculateEndTime(startTime, estimateMinutes),
        estimate: '',
        actualDuration: `${estimateMinutes}m`,
        marker: null,
    };

    return {
        type: 'update',
        content: TaskParser.serialize(completed),
    };
}

export function transformCheckboxPress(
    lineText: string,
    now: Date,
    intent: CheckboxPressIntent,
    options: CheckboxPressOptions = {}
): TaskTransformResult | null {
    if (lineText.match(/^\s+/)) return null;

    const hasExplicitCheckbox = /^- \[( |\/|x)\]/.test(lineText);
    const parsed = hasExplicitCheckbox ? TaskParser.parseLine(lineText) : TaskParser.parseLine(toUncheckedTaskLine(lineText));
    const timeStr = formatTime(now);

    if (intent === 'short') {
        if (parsed.status === ' ' || (!hasExplicitCheckbox && parsed.status === ' ')) {
            return { type: 'update', content: buildRunningLine(parsed, timeStr) };
        }
        if (parsed.status === '/') return { type: 'complete', content: '' };
        if (parsed.status === 'x') return null;
        return null;
    }

    if (parsed.status === ' ' || (!hasExplicitCheckbox && parsed.status === ' ')) {
        return {
            type: 'update',
            content: buildRunningLine(parsed, options.unstartedLongPressStartTime ?? timeStr),
        };
    }

    if (parsed.status === '/' || parsed.status === 'x') {
        return buildResetToUnstartedResult(parsed);
    }

    return null;
}

export function adjustTaskTimeByMinutes(lineText: string, deltaMinutes: number): TaskTransformResult | null {
    if (lineText.match(/^\s+/)) return null;

    const parsed = TaskParser.parseLine(lineText);
    let updated: ParsedTask | null = null;

    if (parsed.status === 'x' && parsed.actualEnd) {
        updated = {
            ...parsed,
            actualEnd: addMinutesToTime(parsed.actualEnd, deltaMinutes),
        };
    } else if (parsed.status === '/' && parsed.actualStart) {
        updated = {
            ...parsed,
            actualStart: addMinutesToTime(parsed.actualStart, deltaMinutes),
        };
    } else if (parsed.status === ' ' && parsed.plannedStart) {
        const nextPlanned = addMinutesToTime(parsed.plannedStart, deltaMinutes);
        updated = {
            ...parsed,
            plannedStart: nextPlanned,
            body: replaceLeadingPlannedStart(parsed.body, nextPlanned),
        };
    }

    if (!updated) return null;

    let content = TaskParser.serialize(updated);
    if (updated.status === 'x' && updated.actualStart && updated.actualEnd) {
        content = normalizeCompletedTaskActualDuration(content) ?? content;
    }

    return { type: 'update', content };
}

export function normalizeCompletedTaskActualDuration(lineText: string): string | null {
    const parsed = TaskParser.parseLine(lineText);
    if (parsed.status !== 'x' || !parsed.actualStart || !parsed.actualEnd) return null;

    const actualDuration = `${calculateDuration(parsed.actualStart, parsed.actualEnd)}m`;
    if (parsed.actualDuration === actualDuration) return null;

    return TaskParser.serialize({
        ...parsed,
        body: normalizePlannedStartInBody(parsed),
        actualDuration,
    });
}

function buildStartResult(parsed: ParsedTask, startTime: string): TaskTransformResult {
    return {
        type: 'update',
        content: buildRunningLine(parsed, startTime),
    };
}

function buildResetToUnstartedResult(parsed: ParsedTask): TaskTransformResult | null {
    if (parsed.status !== '/' && parsed.status !== 'x') return null;

    return {
        type: 'update',
        content: TaskParser.serialize({
            ...parsed,
            body: normalizePlannedStartInBody(parsed),
            status: ' ',
            actualStart: '',
            actualEnd: '',
            actualDuration: '',
        }),
    };
}

function cloneResult(
    parsed: ParsedTask,
    timeStr: string,
    options: { startImmediately: boolean }
): TaskTransformResult {
    const remainingEstimateMinutes = getRemainingEstimateMinutes(parsed);
    const nextEstimate = remainingEstimateMinutes > 0 ? `${remainingEstimateMinutes}m` : '';

    const base: ParsedTask = {
        ...parsed,
        body: normalizePlannedStartInBody(parsed),
        status: options.startImmediately ? '/' : ' ',
        actualStart: options.startImmediately ? timeStr : '',
        actualEnd: '',
        estimate: nextEstimate,
        actualDuration: '',
        marker: null,
    };

    return {
        type: 'insert',
        content: TaskParser.serialize(base),
    };
}

function getEstimateMinutes(parsed: ParsedTask): number {
    if (!parsed.estimate) return 0;
    return Number.parseInt(parsed.estimate.replace(/m$/i, ''), 10) || 0;
}

function getActualDurationMinutes(parsed: ParsedTask): number {
    if (parsed.actualStart && parsed.actualEnd) {
        return calculateDuration(parsed.actualStart, parsed.actualEnd);
    }
    if (parsed.actualDuration) {
        return Number.parseInt(parsed.actualDuration.replace(/m$/i, ''), 10) || 0;
    }
    return 0;
}

function getRemainingEstimateMinutes(parsed: ParsedTask): number {
    const estimateMinutes = getEstimateMinutes(parsed);
    if (estimateMinutes <= 0) return 0;
    const remaining = estimateMinutes - getActualDurationMinutes(parsed);
    return Math.max(remaining, 0);
}

function buildRunningLine(parsed: ParsedTask, startTime: string): string {
    return TaskParser.serialize({
        ...parsed,
        body: normalizePlannedStartInBody(parsed),
        status: '/',
        actualStart: startTime,
        actualEnd: '',
        actualDuration: '',
    });
}

function toUncheckedTaskLine(lineText: string): string {
    const trimmed = lineText.trim();
    const body = trimmed.startsWith('- ') ? trimmed.slice(2).trimStart() : trimmed;
    const normalized = normalizeQuickInputBody(stripSkipLogPrefix(body));
    return `- [ ] ${normalized}`;
}

function stripSkipLogPrefix(body: string): string {
    return body.replace(/^skip:\s*/i, '').trimStart();
}

function normalizeQuickInputBody(body: string): string {
    const raw = body.trim();
    if (!raw) return raw;

    const tokens = raw.split(/\s+/u).filter(Boolean);
    if (tokens.length === 0) return raw;

    let plannedStart = '';
    let estimate = '';
    const used = new Set<number>();

    const parsedLeadingTime = parseQuickInputTimeToken(tokens[0]);
    if (parsedLeadingTime) {
        plannedStart = parsedLeadingTime;
        used.add(0);
    }

    for (let i = 0; i < tokens.length; i++) {
        if (used.has(i) || estimate) continue;
        const parsedEstimate = parseQuickInputEstimateToken(tokens[i]);
        if (!parsedEstimate) continue;
        estimate = parsedEstimate;
        used.add(i);
    }

    const title = tokens
        .filter((_token, index) => !used.has(index))
        .join(' ')
        .trim();

    if (!title) return raw;

    const parts = [plannedStart, title].filter(Boolean);
    if (estimate) parts.push(`(${estimate})`);
    return parts.join(' ');
}

function parseQuickInputTimeToken(token: string): string | null {
    return TaskParser.normalizeLooseTimeToken(token);
}

function parseQuickInputEstimateToken(token: string): string | null {
    const parenMatch = token.match(/^\((.+)\)$/);
    const normalized = TaskParser.normalizeDurationToken(parenMatch ? parenMatch[1] : token);
    return normalized;
}

function replaceLeadingPlannedStart(body: string, nextPlanned: string): string {
    const match = body.match(/^((?:\d{3,4}|\d{1,2}:\d{2}))(?:\s+|$)/);
    if (!match) return [nextPlanned, body].filter(Boolean).join(' ').trim();
    return `${nextPlanned}${body.slice(match[1].length)}`;
}

function normalizePlannedStartInBody(parsed: ParsedTask): string {
    if (!parsed.plannedStart) return parsed.body;
    return replaceLeadingPlannedStart(parsed.body, parsed.plannedStart);
}

function addMinutesToTime(timeStr: string, deltaMinutes: number): string {
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date(2000, 0, 1, h, m);
    date.setMinutes(date.getMinutes() + deltaMinutes);
    return formatTime(date);
}

export function formatTime(date: Date): string {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
}
