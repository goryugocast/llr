import { fromDateString, toDateString } from './yaml-parser';

export interface ParsedRoutineRescheduleMarker {
    matchedText: string;
    startIndex: number;
    endIndex: number;
    canonicalDate: string;
}

const MARKER_PATTERN = /(^|\s)([@＠])(\d{4}-\d{1,2}-\d{1,2}|\d{4}|\d{1,2}\/\d{1,2}|\d{1,2}月\d{1,2}日)\s*$/;
const ONE_YEAR_MS = 366 * 24 * 60 * 60 * 1000;

function normalizeDateOnly(date: Date): Date {
    return fromDateString(toDateString(date));
}

function isValidMonthDay(year: number, month: number, day: number): boolean {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;

    const candidate = new Date(year, month - 1, day);
    return candidate.getFullYear() === year
        && candidate.getMonth() === month - 1
        && candidate.getDate() === day;
}

function resolveMonthDayToFutureDate(baseDate: Date, month: number, day: number): string | null {
    const normalizedBase = normalizeDateOnly(baseDate);
    const baseYear = normalizedBase.getFullYear();
    const candidates = [baseYear, baseYear + 1];

    for (const year of candidates) {
        if (!isValidMonthDay(year, month, day)) continue;
        const candidate = new Date(year, month - 1, day);
        const normalizedCandidate = normalizeDateOnly(candidate);
        if (normalizedCandidate <= normalizedBase) continue;
        if (normalizedCandidate.getTime() - normalizedBase.getTime() > ONE_YEAR_MS) continue;
        return toDateString(normalizedCandidate);
    }

    return null;
}

function parseMarkerToDate(rawMarker: string, baseDate: Date): string | null {
    const normalized = rawMarker.trim();

    const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]);
        const day = Number(isoMatch[3]);
        if (!isValidMonthDay(year, month, day)) return null;
        const candidate = normalizeDateOnly(new Date(year, month - 1, day));
        const normalizedBase = normalizeDateOnly(baseDate);
        if (candidate <= normalizedBase) return null;
        if (candidate.getTime() - normalizedBase.getTime() > ONE_YEAR_MS) return null;
        return toDateString(candidate);
    }

    const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (slashMatch) {
        return resolveMonthDayToFutureDate(baseDate, Number(slashMatch[1]), Number(slashMatch[2]));
    }

    const japaneseMatch = normalized.match(/^(\d{1,2})月(\d{1,2})日$/);
    if (japaneseMatch) {
        return resolveMonthDayToFutureDate(baseDate, Number(japaneseMatch[1]), Number(japaneseMatch[2]));
    }

    const compactMatch = normalized.match(/^(\d{2})(\d{2})$/);
    if (compactMatch) {
        return resolveMonthDayToFutureDate(baseDate, Number(compactMatch[1]), Number(compactMatch[2]));
    }

    return null;
}

export function parseRoutineRescheduleMarker(lineText: string, baseDate: Date): ParsedRoutineRescheduleMarker | null {
    const match = lineText.match(MARKER_PATTERN);
    if (!match) return null;
    const prelude = lineText.slice(0, match.index ?? 0);
    if (prelude.match(/(^|\s)([@＠])(\d{4}-\d{1,2}-\d{1,2}|\d{4}|\d{1,2}\/\d{1,2}|\d{1,2}月\d{1,2}日)(?=\s|$)/)) {
        return null;
    }
    const prefix = match[1] ?? '';
    const rawMarker = match[3] ?? '';
    const canonicalDate = parseMarkerToDate(rawMarker, baseDate);
    if (!canonicalDate) return null;

    const startIndex = (match.index ?? 0) + prefix.length;
    const endIndex = startIndex + 1 + rawMarker.length;
    return {
        matchedText: lineText.slice(startIndex, endIndex),
        startIndex,
        endIndex,
        canonicalDate,
    };
}

export function replaceRoutineRescheduleMarker(lineText: string, marker: ParsedRoutineRescheduleMarker): string {
    return `${lineText.slice(0, marker.startIndex)}→${marker.canonicalDate}${lineText.slice(marker.endIndex)}`;
}
