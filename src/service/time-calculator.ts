import { TaskParser } from './task-parser';

/**
 * Adds minutes to a start time string.
 * @param startTime "09:00"
 * @param durationMin 45
 * @returns "09:45" (24h format, handles day rollover as 00:xx)
 */
export function calculateEndTime(startTime: string, durationMin: number): string {
    const [hours, minutes] = startTime.split(':').map(Number);
    const date = new Date(2000, 0, 1, hours, minutes); // Base date
    date.setMinutes(date.getMinutes() + durationMin);

    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
}

/**
 * Calculates duration in minutes between two time strings.
 * Handles day crossing (e.g. 23:50 -> 00:10).
 * @param start "09:00"
 * @param end "09:45"
 * @returns 45
 */
export function calculateDuration(start: string, end: string): number {
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);

    let minutes1 = h1 * 60 + m1;
    let minutes2 = h2 * 60 + m2;

    if (minutes2 < minutes1) {
        // Day crossing. Add 24 hours (1440 min) to end time.
        minutes2 += 24 * 60;
    }

    return minutes2 - minutes1;
}

export function parseTimeToMinutes(time: string): number | null {
    const match = time.match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    return (hours * 60) + minutes;
}

export function extractCompletionEndTime(text: string): string | null {
    if (text.match(/^- \[x\]/)) {
        // v2 format: actual times are in tail position — body actualStart - actualEnd (duration)
        const parsed = TaskParser.parseLine(text);
        if (parsed.actualEnd) return parsed.actualEnd;
        if (parsed.actualStart) return parsed.actualStart;

        // v1 legacy format: times appear right after [x] at line start
        const legacyMatch = text.match(/^- \[x\]\s*(\d{2}:\d{2})(?:\s*-\s*(\d{2}:\d{2}))?/);
        if (legacyMatch) return legacyMatch[2] ?? legacyMatch[1];
    }

    // Running task: no end time yet, use its start time as the latest activity anchor
    if (text.match(/^- \[[/]\]/)) {
        const parsed = TaskParser.parseLine(text);
        if (parsed.actualStart) return parsed.actualStart;
    }

    return null;
}

export function findLatestCompletionEndTime(lines: Iterable<string>, referenceTime?: string): string | null {
    const referenceMinutes = referenceTime ? parseTimeToMinutes(referenceTime) : null;
    let best: { time: string; minutesAgo: number } | null = null;

    for (const line of lines) {
        const endTime = extractCompletionEndTime(line.trim());
        if (!endTime) continue;

        const minutes = parseTimeToMinutes(endTime);
        if (minutes === null) continue;

        // Compute "how many minutes ago" relative to reference, handling day rollover.
        // If no reference, treat larger minute values as more recent (absolute latest).
        let minutesAgo: number;
        if (referenceMinutes === null) {
            minutesAgo = -minutes;
        } else if (minutes <= referenceMinutes) {
            minutesAgo = referenceMinutes - minutes;
        } else {
            // Time is after reference — treat as previous day
            minutesAgo = referenceMinutes + (1440 - minutes);
        }

        if (!best || minutesAgo < best.minutesAgo) {
            best = { time: endTime, minutesAgo };
        }
    }

    return best?.time ?? null;
}

