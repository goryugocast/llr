export type DurationCalculator = (start: string, end: string) => number;

interface LineParseResult {
    status: ' ' | '/' | 'x' | '-' | 'pending';
    content: string;
}

function parseLine(line: string): LineParseResult | null {
    if (line.match(/^\s+/)) return null; // Ignore indented lines

    const checkboxMatch = line.match(/^- \[(.)\]\s*(.*)/);
    if (!checkboxMatch) return null;

    const status = checkboxMatch[1] as LineParseResult['status'];
    return { status, content: checkboxMatch[2] };
}

function toMinutes(rawValue: string, unit: string): number {
    const val = parseFloat(rawValue);
    const normalized = unit.toLowerCase();
    if (normalized === 'h') return Math.floor(val * 60);
    return Math.floor(val);
}

export function estimateFromLineEnd(text: string): number {
    // "(30m > 45m)" anywhere: use actual (right side)
    const arrowParen = text.match(/\(\s*(\d+(?:\.\d+)?)\s*(h|m|min)\s*>\s*(\d+(?:\.\d+)?)\s*(h|m|min)\s*\)/i);
    if (arrowParen) return toMinutes(arrowParen[3], arrowParen[4]);

    // "(30m)" / "(1.5h)" anywhere
    const singleParen = text.match(/\(\s*(\d+(?:\.\d+)?)\s*(h|m|min)\s*\)/i);
    if (singleParen) return toMinutes(singleParen[1], singleParen[2]);

    // "30m" / "60min" / "1.5h" at line end
    const bare = text.match(/(\d+(?:\.\d+)?)\s*(h|m|min)\s*$/i);
    if (bare) return toMinutes(bare[1], bare[2]);

    return 0;
}

export function computeStatusBarMetrics(
    lines: string[],
    cursorLine: number,
    nowTime: string,
    durationCalculator: DurationCalculator
): { totalMin: number; remainMin: number; cursorMin: number } {
    let totalMin = 0;
    let remainMin = 0;
    let cursorMin = 0;

    for (let i = 0; i < lines.length; i++) {
        const parsed = parseLine(lines[i]);
        if (!parsed) continue;

        const mins = estimateFromLineEnd(parsed.content);
        if (mins === 0) continue;

        totalMin += mins;

        const isUnstarted = parsed.status === ' ';
        const isRunning = parsed.status === '/';

        if (!isUnstarted && !isRunning) continue;

        let remainingForThisLine = mins;
        if (isRunning) {
            const timeMatch = parsed.content.match(/(\d{2}:\d{2})/);
            if (timeMatch) {
                const elapsed = durationCalculator(timeMatch[1], nowTime);
                remainingForThisLine = Math.max(0, mins - elapsed);
            }
        }

        remainMin += remainingForThisLine;
        if (i <= cursorLine) cursorMin += remainingForThisLine;
    }

    return { totalMin, remainMin, cursorMin };
}
