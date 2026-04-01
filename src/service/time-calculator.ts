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
    const match = text.match(/^- \[x\]\s*(\d{2}:\d{2})(?:\s*-\s*(\d{2}:\d{2}))?/);
    if (!match) return null;
    return match[2] ?? match[1];
}

export function findLatestCompletionEndTime(lines: Iterable<string>, referenceTime?: string): string | null {
    const referenceMinutes = referenceTime ? parseTimeToMinutes(referenceTime) : null;
    let latest: { time: string; minutes: number } | null = null;
    let latestBeforeReference: { time: string; minutes: number } | null = null;

    for (const line of lines) {
        const endTime = extractCompletionEndTime(line.trim());
        if (!endTime) continue;

        const minutes = parseTimeToMinutes(endTime);
        if (minutes === null) continue;

        if (!latest || minutes > latest.minutes) {
            latest = { time: endTime, minutes };
        }

        if (referenceMinutes !== null && minutes <= referenceMinutes) {
            if (!latestBeforeReference || minutes > latestBeforeReference.minutes) {
                latestBeforeReference = { time: endTime, minutes };
            }
        }
    }

    return latestBeforeReference?.time ?? latest?.time ?? null;
}

/**
 * Extracts estimate duration from task text.
 * Supports: (45m), (1h), (60min), 1.5h, 45 m, (30m > 45m)
 * @param text Task content
 * @returns number (minutes) or 0
 */
export function estimateFromText(text: string): number {
    // 1. Strip potential leading checkboxes/timestamps to focus on the "content" part
    // but keep it simple: focus on parentheses or specific units.

    // 2. Handle the "change" pattern: (30m > 45m)
    const changeMatch = text.match(/>\s*([^)]+)/);
    const targetText = changeMatch ? changeMatch[1] : text;

    // 3. Regex for duration patterns:
    // a) (30) or (30m) or (1h) - strictly inside parentheses
    // b) 30m, 1.5h, 60min - number followed by unit (must have unit if no parens)
    // Avoids matching "09:50" as "50" because ":" is not allowed before the number in this context.

    // Pattern explanation:
    // (?:\(|\s|^) : starts with paren, space, or line start
    // (\d+(?:\.\d+)?) : the number
    // \s* : optional space
    // (h|m|min)? : optional unit
    // (?:\)|\s|$) : ends with paren, space, or line end
    const pattern = /(?:\(|\b)(\d+(?:\.\d+)?)\s*(h|m|min)?(?:\)|\b)/gi;

    const matches = [...targetText.matchAll(pattern)];
    if (matches.length === 0) return 0;

    // We want the most "suffix-like" match that HAS a unit or is in PARENS.
    // Let's filter matches.
    const validMatches = matches.filter(m => {
        const fullMatch = m[0];
        const unit = m[2];
        const isParens = fullMatch.startsWith('(') && fullMatch.endsWith(')');
        const hasUnit = !!unit;

        // If it starts with a colon, it's probably part of a timestamp, skip it.
        const prevChar = targetText[m.index! - 1];
        if (prevChar === ':') return false;

        return isParens || hasUnit;
    });

    if (validMatches.length === 0) return 0;

    const lastMatch = validMatches[validMatches.length - 1];
    const rawVal = parseFloat(lastMatch[1]);
    const unit = (lastMatch[2] || 'm').toLowerCase();

    if (unit.startsWith('h')) {
        return Math.floor(rawVal * 60);
    }
    return Math.floor(rawVal);
}
