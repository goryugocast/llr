import { TaskParser, type ParsedTaskStatus } from './task-parser';

export interface ReflectionTask {
    id: number;
    /** Zero-based Markdown line, for opening the source note. */
    line: number;
    sourceLine: number;
    title: string;
    status: ParsedTaskStatus;
    actualStart: string;
    actualEnd: string;
    /** Original task line followed by indented supplement lines, if any. */
    source: string;
    supplements: string;
    supplement: string;
    startMinute: number | null;
    endMinute: number | null;
}

export interface ReflectionBlock {
    id: number;
    title: string;
    startMinute: number | null;
    endMinute: number | null;
    tasks: ReflectionTask[];
}

export interface ReflectionHour {
    hour: number;
    representativeTaskId: number | null;
    taskIds: number[];
}

export interface ReflectionTimeline {
    tasks: ReflectionTask[];
    hours: ReflectionHour[];
    blocks: ReflectionBlock[];
    /** Tasks that have no positive actual interval; planned time is deliberately ignored. */
    withoutActualInterval: number[];
}

/**
 * Extract logged tasks and a compact hourly summary from a daily note.
 * The configurable day boundary makes early-morning work part of the preceding day.
 */
export function buildReflectionTimeline(markdown: string, dayBoundaryHour = 3): ReflectionTimeline {
    const lines = markdown.split(/\r?\n/);
    const rawTasks: Array<{ line: string; sourceLine: number; supplements: string[] }> = [];
    let fence: { character: string; length: number } | null = null;
    let inFrontmatter = false;
    for (let i = 0; i < lines.length; i++) {
        if (i === 0 && lines[i].trim() === '---') { inFrontmatter = true; continue; }
        if (inFrontmatter) { if (/^(---|\.\.\.)$/.test(lines[i].trim())) inFrontmatter = false; continue; }
        const marker = lines[i].match(/^\s*(`{3,}|~{3,})/);
        if (fence) {
            if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && lines[i].trim() === marker[1]) fence = null;
            continue;
        }
        if (marker) { fence = { character: marker[1][0], length: marker[1].length }; continue; }
        const isRecord = /^\s*-\s+\[[ /x]\]\s*\S/.test(lines[i]) || /^-\s+(?!\[[ /x]\])\S/.test(lines[i]);
        if (!isRecord) continue;
        const entry = { line: lines[i], sourceLine: i + 1, supplements: [] as string[] };
        const indent = lines[i].match(/^\s*/)?.[0].length ?? 0;
        let j = i + 1;
        let supplementFence: { character: string; length: number } | null = null;
        const pendingBlanks: string[] = [];
        while (j < lines.length) {
            const next = lines[j];
            const nestedMarker = next.match(/^\s*(`{3,}|~{3,})/);
            if (supplementFence) {
                entry.supplements.push(next);
                if (nestedMarker && nestedMarker[1][0] === supplementFence.character && nestedMarker[1].length >= supplementFence.length && next.trim() === nestedMarker[1]) supplementFence = null;
                j++;
                continue;
            }
            if (!next.trim()) { pendingBlanks.push(''); j++; continue; }
            const nextIndent = next.match(/^\s*/)?.[0].length ?? 0;
            if (nextIndent <= indent || /^\s*-\s+\[[ /x]\]\s*\S/.test(next)) break;
            entry.supplements.push(...pendingBlanks, next);
            pendingBlanks.length = 0;
            if (nestedMarker) supplementFence = { character: nestedMarker[1][0], length: nestedMarker[1].length };
            j++;
        }
        rawTasks.push(entry);
        i = j - 1;
    }

    const tasks = rawTasks.map(({ line, sourceLine, supplements }, id): ReflectionTask => {
        const parsed = TaskParser.parseLine(line);
        const startMinute = parseClock(parsed.actualStart);
        const endMinute = parseClock(parsed.actualEnd);
        let start = startMinute;
        let end = endMinute;
        if (start !== null && end === null && start < dayBoundaryHour * 60) start += 1440;
        if (start !== null && end !== null) {
            if (end < start) end += 1440;
            if (start < dayBoundaryHour * 60) { start += 1440; end += 1440; }
        }
        return {
            id,
            line: sourceLine - 1,
            sourceLine,
            title: parsed.content,
            status: parsed.status,
            actualStart: parsed.actualStart,
            actualEnd: parsed.actualEnd,
            source: [line, ...supplements].join('\n'),
            supplements: supplements.join('\n'),
            supplement: supplements.join('\n'),
            startMinute: start,
            endMinute: end,
        };
    });

    const hours: ReflectionHour[] = Array.from({ length: 24 }, (_, hour): ReflectionHour => ({ hour, representativeTaskId: null, taskIds: [] }));
    const firstHour = dayBoundaryHour;
    // A task may cross the following day's cutoff. Keep its whole recorded interval.
    const lastHour = Math.max(firstHour + 24, ...tasks.map(task => Math.ceil((task.endMinute ?? task.startMinute ?? 0) / 60)));
    const hourlyRepresentatives = new Map<number, number>();
    for (let absoluteHour = firstHour; absoluteHour < lastHour; absoluteHour++) {
        const start = absoluteHour * 60;
        const end = start + 60;
        let bestId: number | null = null;
        let bestOverlap = 0;
        for (const task of tasks) {
            if (task.startMinute === null || task.endMinute === null || task.endMinute <= task.startMinute) continue;
            const overlap = Math.max(0, Math.min(task.endMinute, end) - Math.max(task.startMinute, start));
            if (overlap > bestOverlap || (overlap > 0 && overlap === bestOverlap && (bestId === null || task.id < bestId))) { bestOverlap = overlap; bestId = task.id; }
        }
        hourlyRepresentatives.set(absoluteHour, bestId ?? -1);
        const clockHour = absoluteHour % 24;
        hours[clockHour].representativeTaskId = bestId;
    }
    const representativeRuns: Array<{ startHour: number; endHour: number; taskId: number }> = [];
    for (let hour = firstHour; hour < lastHour; hour++) {
        const taskId = hourlyRepresentatives.get(hour) ?? -1;
        if (taskId < 0) continue;
        const previous = representativeRuns[representativeRuns.length - 1];
        if (previous && previous.taskId === taskId && previous.endHour === hour) previous.endHour++;
        else representativeRuns.push({ startHour: hour, endHour: hour + 1, taskId });
    }
    const blocks: ReflectionBlock[] = representativeRuns.map((run, id) => ({
        id,
        title: tasks[run.taskId].title,
        startMinute: run.startHour * 60,
        endMinute: run.endHour * 60,
        tasks: [] as ReflectionTask[],
    }));
    for (const task of tasks) {
        if (task.startMinute === null) continue;
        if (task.endMinute === null || task.endMinute <= task.startMinute) {
            const containing = blocks.findIndex(block => block.startMinute !== null && block.endMinute !== null && task.startMinute >= block.startMinute && task.startMinute < block.endMinute);
            if (containing >= 0) blocks[containing].tasks.push(task);
            else blocks.push({ id: blocks.length, title: task.title, startMinute: task.startMinute, endMinute: task.endMinute ?? task.startMinute, tasks: [task] });
            continue;
        }
        let bestBlock = -1;
        let bestOverlap = 0;
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const overlap = Math.max(0, Math.min(task.endMinute, block.endMinute ?? 0) - Math.max(task.startMinute, block.startMinute ?? 0));
            if (overlap > bestOverlap) { bestOverlap = overlap; bestBlock = i; }
        }
        if (bestBlock >= 0) blocks[bestBlock].tasks.push(task);
        else blocks.push({ id: blocks.length, title: task.title, startMinute: task.startMinute, endMinute: task.endMinute, tasks: [task] });
    }
    const noActual = tasks.filter(task => task.startMinute === null);
    if (noActual.length) blocks.push({ id: blocks.length, title: '実績時刻のない記録', startMinute: null, endMinute: null, tasks: noActual });
    for (const block of blocks) block.tasks.sort((a, b) => (a.startMinute ?? Infinity) - (b.startMinute ?? Infinity) || a.id - b.id);
    blocks.sort((a, b) => (a.startMinute ?? Number.MAX_SAFE_INTEGER) - (b.startMinute ?? Number.MAX_SAFE_INTEGER) || a.id - b.id);
    return {
        tasks,
        hours,
        blocks,
        withoutActualInterval: tasks.filter(t => t.startMinute === null || t.endMinute === null || t.endMinute <= t.startMinute).map(t => t.id),
    };
}

function parseClock(value: string): number | null {
    const match = value.match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}
