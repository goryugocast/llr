import { calculateDuration, calculateEndTime, estimateFromText } from './time-calculator';
import { TaskParser } from './task-parser';

/**
 * Pure functions for task string transformations.
 * Decoupled from Obsidian API for testing.
 */

export interface TaskTransformResult {
    type: 'update' | 'insert' | 'complete' | 'interrupt' | 'none';
    content: string;
    extraContent?: string;
}

export type TaskAction = 'start' | 'complete' | 'interrupt' | 'duplicate' | 'retroComplete' | 'taskify';
export type CheckboxPressIntent = 'short' | 'long';
export interface CheckboxPressOptions {
    unstartedLongPressStartTime?: string;
}
const TASK_STATUS_PREFIX_REGEX = /^- \[( |\/|x)\] ?/;

export function transformTaskLine(
    lineText: string,
    now: Date,
    forceAction?: TaskAction
): TaskTransformResult | null {
    if (lineText.match(/^\s+/)) return null; // Indented

    const timePattern = /\d{2}:\d{2}/g;
    const times = lineText.match(timePattern) || [];
    const timeCount = times.length;
    const timeStr = formatTime(now);

    const isRunning = lineText.startsWith('- [/]');
    const isDone = lineText.startsWith('- [x]');
    const isUnstarted = lineText.startsWith('- [ ]') || !lineText.startsWith('- [');
    const hasExplicitCheckbox = /^- \[( |\/|x)\]/.test(lineText);

    // === Force Action Handling ===
    if (forceAction) {
        return applyForcedAction(lineText, now, forceAction, {
            isRunning,
            isDone,
            hasExplicitCheckbox,
            timeStr,
        });
    }

    // Plain text lines: first toggle only creates an unchecked task line.
    if (!hasExplicitCheckbox) {
        return {
            type: 'update',
            content: toUncheckedTaskLine(lineText),
        };
    }

    // Case 0: No timestamps
    if (timeCount === 0) {
        if (isDone) return cloneResult(lineText, timeStr, { startImmediately: false });
        // Explicit checkbox lines keep smart estimate normalization.
        const hourMatch = lineText.match(/\s(\d+(?:\.\d+)?)h$/);
        if (isUnstarted && hourMatch) {
            const mins = Math.floor(parseFloat(hourMatch[1]) * 60);
            const cleanText = lineText.replace(/\s\d+(?:\.\d+)?h$/, '').trim();
            const checkbox = lineText.startsWith('- [ ]') ? '' : '- [ ] ';
            return { type: 'update', content: `${checkbox}${cleanText} (${mins}m)` };
        }

        const estimateMatch = lineText.match(/\s(\d{1,3})$/);
        if (isUnstarted && estimateMatch) {
            const val = estimateMatch[1];
            const cleanText = lineText.replace(/\s(\d{1,3})$/, '').trim();
            const checkbox = lineText.startsWith('- [ ]') ? '' : '- [ ] ';
            return { type: 'update', content: `${checkbox}${cleanText} (${val}m)` };
        }

        // Strip the existing HH:mm timestamp from content (replace with current time)
        let content = lineText.replace(TASK_STATUS_PREFIX_REGEX, '').trim();
        content = content.replace(/\d{2}:\d{2}\s*-?\s*/, '').trim();
        return { type: 'update', content: `- [/] ${timeStr} - ${content}` };
    }

    // Case 1: 1 timestamp
    if (timeCount === 1) {
        // If task has an explicit [ ] checkbox, it is "Unstarted with a plan".
        // Toggling always = Start Now → Running.
        // Strip any pre-set HH:mm and replace with current time.
        if (lineText.startsWith('- [ ]')) {
            let content = lineText.replace(/^- \[ \] ?/, '').trim();
            // Remove pre-set time prefix like "07:30 - " or "07:30 " (dash is optional)
            content = content.replace(/^\d{2}:\d{2}\s*-?\s*/, '').trim();
            return {
                type: 'update',
                content: `- [/] ${timeStr} - ${content}`
            };
        }

        // Explicit [ ] task with planned time + duration: start now (not retro-complete).
        if (isRunning) return { type: 'complete', content: '' };
        if (isDone) return cloneResult(lineText, timeStr, { startImmediately: false });

        if (lineText.includes(times[0] + ' -')) {
            return {
                type: 'update',
                content: lineText.replace(TASK_STATUS_PREFIX_REGEX, '- [/] ').trim()
            };
        }

        // Strip existing HH:mm from content (replace with current time)
        let content = lineText.replace(TASK_STATUS_PREFIX_REGEX, '').trim();
        content = content.replace(/\d{2}:\d{2}\s*-?\s*/, '').trim();
        return { type: 'update', content: `- [/] ${timeStr} - ${content}` };
    }


    // Case 2+: Multiple timestamps
    if (timeCount >= 2) {
        if (isDone) return cloneResult(lineText, timeStr, { startImmediately: false });

        const [t1, t2] = times.slice(0, 2);
        const min1 = timeToMin(t1);
        const min2 = timeToMin(t2);
        const start = min1 <= min2 ? t1 : t2;
        const end = min1 <= min2 ? t2 : t1;
        const duration = calculateDuration(start, end);

        let taskPart = lineText.replace(TASK_STATUS_PREFIX_REGEX, '');
        taskPart = taskPart.replace(/\d{2}:\d{2}/g, '').replace(/\(\d+m( > \d+m)?\)/g, '').trim();
        taskPart = taskPart.replace(/^[- ]+/, '').trim();

        return {
            type: 'update',
            content: `- [x] ${start} - ${end} (${duration}m) ${taskPart}`
        };
    }

    return null;
}

function applyForcedAction(
    lineText: string,
    now: Date,
    forceAction: TaskAction,
    state: {
        isRunning: boolean;
        isDone: boolean;
        hasExplicitCheckbox: boolean;
        timeStr: string;
    }
): TaskTransformResult | null {
    const { isRunning, isDone, hasExplicitCheckbox, timeStr } = state;

    switch (forceAction) {
        case 'taskify':
            if (hasExplicitCheckbox) return null;
            return { type: 'update', content: toUncheckedTaskLine(lineText) };
        case 'retroComplete':
            return buildRetroCompleteResult(lineText);
        case 'duplicate':
            return cloneResult(lineText, timeStr, { startImmediately: false });
        case 'start': {
            if (isRunning) return null;
            if (isDone) return cloneResult(lineText, timeStr, { startImmediately: true });
            const resolved = resolveStartableTask(lineText, timeStr);
            return { type: 'update', content: `- [/] ${resolved.startTime} - ${resolved.content}` };
        }
        case 'complete':
            if (!isRunning) return null;
            return { type: 'complete', content: '' };
        case 'interrupt':
            if (!isRunning) return null;
            return buildInterruptResult(lineText, now);
        default:
            return null;
    }
}

function buildRetroCompleteResult(lineText: string): TaskTransformResult | null {
    const timePattern = /\d{2}:\d{2}/g;
    const times = lineText.match(timePattern) || [];

    if (times.length === 1) {
        const durationPattern = /(\d+(?:\.\d+)?)(h|m)/;
        const durMatch = lineText.match(durationPattern);
        if (!durMatch) return null;

        const startTime = times[0];
        const rawVal = parseFloat(durMatch[1]);
        const unit = durMatch[2];
        const duration = unit === 'h' ? Math.floor(rawVal * 60) : Math.floor(rawVal);
        const endTime = calculateEndTime(startTime, duration);

        let taskPart = lineText.replace(TASK_STATUS_PREFIX_REGEX, '');
        taskPart = taskPart.replace(startTime, '').replace(durMatch[0], '').trim();
        taskPart = taskPart.replace(/^[- ]+/, '').trim();

        return {
            type: 'update',
            content: `- [x] ${startTime} - ${endTime} (${duration}m) ${taskPart}`
        };
    }

    if (times.length >= 2) {
        const [t1, t2] = times.slice(0, 2);
        const min1 = timeToMin(t1);
        const min2 = timeToMin(t2);
        const start = min1 <= min2 ? t1 : t2;
        const end = min1 <= min2 ? t2 : t1;
        const duration = calculateDuration(start, end);

        let taskPart = lineText.replace(TASK_STATUS_PREFIX_REGEX, '');
        taskPart = taskPart.replace(/\d{2}:\d{2}/g, '').replace(/\(\d+m( > \d+m)?\)/g, '').trim();
        taskPart = taskPart.replace(/^[- ]+/, '').trim();

        return {
            type: 'update',
            content: `- [x] ${start} - ${end} (${duration}m) ${taskPart}`
        };
    }

    return null;
}

export function transformCheckboxPress(
    lineText: string,
    now: Date,
    intent: CheckboxPressIntent,
    options: CheckboxPressOptions = {}
): TaskTransformResult | null {
    if (lineText.match(/^\s+/)) return null; // Indented

    const timePattern = /\d{2}:\d{2}/g;
    const times = lineText.match(timePattern) || [];
    const timeStr = formatTime(now);

    const isRunning = lineText.startsWith('- [/]');
    const isComplete = lineText.startsWith('- [x]');
    const isUnstarted = lineText.startsWith('- [ ]') || !lineText.startsWith('- [');

    if (intent === 'short') {
        if (isUnstarted) {
            return buildStartResult(lineText, timeStr, { preferPlannedStart: true });
        }
        if (isRunning) return { type: 'complete', content: '' };
        if (isComplete) return null;
        return null;
    }

    // Long press behavior
    if (isUnstarted) {
        return buildStartResult(lineText, options.unstartedLongPressStartTime ?? timeStr, {
            preferPlannedStart: false
        });
    }

    if (isRunning) {
        return buildResetToUnstartedResult(lineText);
    }

    if (isComplete) {
        return buildResetToUnstartedResult(lineText);
    }

    return null;
}

export function adjustTaskTimeByMinutes(lineText: string, deltaMinutes: number): TaskTransformResult | null {
    if (lineText.match(/^\s+/)) return null; // Indented

    const timeMatches = [...lineText.matchAll(/\d{2}:\d{2}/g)];
    if (timeMatches.length === 0) return null;

    const targetTimeIndex = timeMatches.length >= 2 ? 1 : 0;
    const target = timeMatches[targetTimeIndex];
    const originalTime = target[0];
    const adjustedTime = addMinutesToTime(originalTime, deltaMinutes);

    const startIndex = target.index ?? -1;
    if (startIndex < 0) return null;
    let updated = lineText.slice(0, startIndex) + adjustedTime + lineText.slice(startIndex + originalTime.length);

    // Completed lines usually encode actual duration in parentheses. Keep it consistent.
    if (lineText.startsWith('- [x]') && timeMatches.length >= 2) {
        const normalized = normalizeCompletedTaskActualDuration(updated);
        if (normalized) updated = normalized;
    }

    return { type: 'update', content: updated };
}

export function normalizeCompletedTaskActualDuration(lineText: string): string | null {
    if (!lineText.startsWith('- [x]')) return null;

    const times = lineText.match(/\d{2}:\d{2}/g) ?? [];
    if (times.length < 2) return null;

    const actualDuration = calculateDuration(times[0], times[1]);
    if (lineText.match(/\((\d+)m\s*>\s*(\d+)m\)/)) {
        const updated = lineText.replace(/\((\d+)m\s*>\s*(\d+)m\)/, (_m, estimate) => `(${estimate}m > ${actualDuration}m)`);
        return updated === lineText ? null : updated;
    }

    if (lineText.match(/\((\d+)m\)/)) {
        const updated = lineText.replace(/\((\d+)m\)/, `(${actualDuration}m)`);
        return updated === lineText ? null : updated;
    }

    return null;
}

function cloneResult(
    lineText: string,
    timeStr: string,
    options: { startImmediately: boolean }
): TaskTransformResult {
    const doneEstimateMinutes = extractDoneEstimateMinutes(lineText);
    const doneActualMinutes = extractDoneActualMinutes(lineText);
    const nextEstimateMinutes = doneEstimateMinutes !== null && doneActualMinutes !== null
        ? Math.max(doneEstimateMinutes - doneActualMinutes, 0)
        : null;

    let taskPart = lineText.replace(TASK_STATUS_PREFIX_REGEX, '');
    taskPart = taskPart.replace(/\d{2}:\d{2}/g, '');
    taskPart = taskPart.replace(/\(\d+m( > \d+m)?\)/g, '');
    taskPart = taskPart.replace(/ - /g, ' ').replace(/-/g, ' ').trim();
    taskPart = stripInterruptMarker(taskPart);

    if (!options.startImmediately) {
        const estimateSuffix = nextEstimateMinutes !== null && nextEstimateMinutes > 0 ? ` (${nextEstimateMinutes}m)` : '';
        return {
            type: 'insert',
            content: `- [ ] ${taskPart}${estimateSuffix}`.trim(),
        };
    }

    return {
        type: 'insert',
        content: `- [/] ${timeStr} - ${taskPart}`
    };
}

function extractDoneEstimateMinutes(lineText: string): number | null {
    const estimateVsActual = lineText.match(/\((\d+)m\s*>\s*\d+m\)/);
    if (estimateVsActual) return Number(estimateVsActual[1]);

    const singleDuration = lineText.match(/\((\d+)m\)/);
    if (singleDuration) return Number(singleDuration[1]);

    return null;
}

function extractDoneActualMinutes(lineText: string): number | null {
    const times = lineText.match(/\d{2}:\d{2}/g) ?? [];
    if (times.length >= 2) {
        return calculateDuration(times[0], times[1]);
    }

    const estimateVsActual = lineText.match(/\(\d+m\s*>\s*(\d+)m\)/);
    if (estimateVsActual) return Number(estimateVsActual[1]);

    const singleDuration = lineText.match(/\((\d+)m\)/);
    if (singleDuration) return Number(singleDuration[1]);

    return null;
}

function buildStartResult(
    lineText: string,
    startTime: string,
    options: { preferPlannedStart?: boolean } = {}
): TaskTransformResult {
    const resolved = resolveStartableTask(lineText, startTime, {
        preferPlannedStart: options.preferPlannedStart ?? true
    });
    return { type: 'update', content: `- [/] ${resolved.startTime} - ${resolved.content}` };
}

function buildResetToUnstartedResult(lineText: string): TaskTransformResult | null {
    const isRunning = lineText.startsWith('- [/]');
    const isComplete = lineText.startsWith('- [x]');
    if (!isRunning && !isComplete) return null;

    const body = lineText.replace(TASK_STATUS_PREFIX_REGEX, '').trim();
    const runningStartTime = isRunning ? (body.match(/^(\d{2}:\d{2})\s*-\s*/)?.[1] ?? null) : null;
    const estimateMinutes = extractEstimateMinutesForReset(lineText);

    let taskPart = body;
    if (isRunning) {
        taskPart = taskPart.replace(/^\d{2}:\d{2}\s*-\s*/, '').trim();
    } else {
        taskPart = taskPart
            .replace(/^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\s*/, '')
            .replace(/^\d{2}:\d{2}\s*/, '')
            .trim();
    }

    // Remove duration blocks (actual/estimate) and clean separators for a parseable unstarted line.
    taskPart = taskPart.replace(/\(\d+m(?:\s*>\s*\d+m)?\)\s*/g, '').trim();
    taskPart = taskPart.replace(/^[- ]+/, '').trim();

    const parts: string[] = ['- [ ]'];
    if (runningStartTime) parts.push(`${runningStartTime} -`);
    if (taskPart) parts.push(taskPart);
    if (estimateMinutes !== null) parts.push(`(${estimateMinutes}m)`);

    return { type: 'update', content: parts.join(' ').trim() };
}

function extractEstimateMinutesForReset(lineText: string): number | null {
    const estimateVsActual = lineText.match(/\((\d+)m\s*>\s*\d+m\)/);
    if (estimateVsActual) return Number(estimateVsActual[1]);

    const singleDuration = lineText.match(/\((\d+)m\)/);
    if (singleDuration) return Number(singleDuration[1]);

    return null;
}

function toUncheckedTaskLine(lineText: string): string {
    const trimmed = lineText.trim();
    const body = trimmed.startsWith('- ') ? trimmed.slice(2).trimStart() : trimmed;
    const normalized = normalizeQuickInputBody(stripSkipLogPrefix(body));
    return `- [ ] ${normalized}`;
}

function extractStartableTaskBody(lineText: string): string {
    return resolveStartableTask(lineText, formatTime(new Date(2000, 0, 1, 0, 0))).content;
}

function normalizeLooseUnstartedBody(body: string): string {
    const alreadyStructured = /^\d{2}:\d{2}\s*-/.test(body) || /\(\d+m\)\s*$/i.test(body);
    if (alreadyStructured) return body;
    return normalizeQuickInputBody(body);
}

function resolveStartableTask(
    lineText: string,
    fallbackStartTime: string,
    options: { preferPlannedStart?: boolean } = {}
): { startTime: string; content: string } {
    let content = lineText.replace(TASK_STATUS_PREFIX_REGEX, '').trim();
    if (content.startsWith('- ')) {
        content = content.slice(2).trimStart();
    }
    content = normalizeLooseUnstartedBody(content);

    const shouldPreferPlannedStart = options.preferPlannedStart ?? true;
    const plannedStartTime = shouldPreferPlannedStart
        ? (content.match(/^(\d{2}:\d{2})\s*-\s*/)?.[1] ?? fallbackStartTime)
        : fallbackStartTime;
    const normalizedContent = content.replace(/^(\d{2}:\d{2}\s*(-|>)?\s*|\(\d+m\)\s*)+/g, '').trim();
    return { startTime: plannedStartTime, content: normalizedContent };
}

function stripSkipLogPrefix(body: string): string {
    return body.replace(/^skip:\s*/i, '').trimStart();
}

function normalizeQuickInputBody(body: string): string {
    const raw = body.trim();
    if (!raw) return raw;

    const tokens = raw.split(/\s+/u).filter(Boolean);
    if (tokens.length === 0) return raw;

    let plannedStart: string | undefined;
    let estimate: string | undefined;
    const used = new Set<number>();

    const parsedLeadingTime = parseQuickInputTimeToken(tokens[0]);
    if (parsedLeadingTime) {
        plannedStart = parsedLeadingTime;
        used.add(0);
    }

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (!estimate) {
            const parsedEstimate = parseQuickInputEstimateToken(token);
            if (parsedEstimate) {
                estimate = parsedEstimate;
                used.add(i);
                continue;
            }
        }
    }

    const title = tokens
        .filter((_token, index) => !used.has(index))
        .join(' ')
        .trim();

    // Avoid generating empty-title task lines from pure time/duration inputs.
    if (!title) return raw;

    const parts: string[] = [];
    if (plannedStart) parts.push(`${plannedStart} -`);
    parts.push(title);
    if (estimate) parts.push(`(${estimate})`);
    return parts.join(' ');
}

function parseQuickInputTimeToken(token: string): string | null {
    if (/^\d{4}$/.test(token)) {
        const hh = Number(token.slice(0, 2));
        const mm = Number(token.slice(2, 4));
        if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
            return `${token.slice(0, 2)}:${token.slice(2, 4)}`;
        }
        return null;
    }

    const colon = token.match(/^(\d{1,2}):(\d{2})$/);
    if (colon) {
        const hh = Number(colon[1]);
        const mm = Number(colon[2]);
        if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
            return `${colon[1].padStart(2, '0')}:${colon[2]}`;
        }
    }

    return null;
}

function parseQuickInputEstimateToken(token: string): string | null {
    const parenUnit = token.match(/^\((\d+(?:\.\d+)?)(h|m|min)\)$/i);
    if (parenUnit) {
        return formatEstimateToken(parenUnit[1], parenUnit[2]);
    }

    const unit = token.match(/^(\d+(?:\.\d+)?)(h|m|min)$/i);
    if (unit) {
        return formatEstimateToken(unit[1], unit[2]);
    }

    if (/^\d{1,3}$/.test(token)) {
        return `${parseInt(token, 10)}m`;
    }

    return null;
}

function formatEstimateToken(rawValue: string, rawUnit: string): string {
    const unit = rawUnit.toLowerCase();
    if (unit === 'h') {
        return `${Math.floor(parseFloat(rawValue) * 60)}m`;
    }
    return `${Math.floor(parseFloat(rawValue))}m`;
}

function extractTaskNameForReset(lineText: string): string {
    let taskPart = lineText.replace(TASK_STATUS_PREFIX_REGEX, '').trim();
    // Strip all timestamps and durations
    taskPart = taskPart.replace(/(\d{2}:\d{2}\s*(-|>)?\s*|\(\d+m\)\s*)+/g, '').trim();
    return stripInterruptMarker(taskPart);
}

function buildInterruptResult(lineText: string, now: Date): TaskTransformResult | null {
    const parsed = TaskParser.parseLine(lineText);
    const startTime = parsed.times[0];
    if (!startTime) return null;

    const endTime = formatTime(now);
    const actualDuration = calculateDuration(startTime, endTime);
    const estimateMin = parsed.estimate ? estimateFromText(parsed.estimate) : 0;

    const timeInfo = estimateMin > 0 && estimateMin !== actualDuration
        ? `(${estimateMin}m > ${actualDuration}m)`
        : `(${actualDuration}m)`;

    const baseContent = (parsed.content || extractTaskNameForReset(lineText)).trim();
    const completedLine = `- [x] ${startTime} - ${endTime} ${timeInfo}${baseContent ? ` ${baseContent}` : ''}`;

    const remainingEstimate = estimateMin > 0 ? Math.max(estimateMin - actualDuration, 0) : 0;
    const followupLine = `- [ ] ${baseContent}${remainingEstimate > 0 ? ` (${remainingEstimate}m)` : ''}`.trim();

    return {
        type: 'interrupt',
        content: completedLine,
        extraContent: followupLine,
    };
}

function stripInterruptMarker(text: string): string {
    return text.replace(/\s*⏸️?\s*$/, '').trim();
}

function timeToMin(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
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
