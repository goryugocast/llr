/**
 * Pure functions for parsing schedule/frequency YAML and calculating next due dates.
 */

export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
type WeekdayToken = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type LegacyFrequency =
    | { type: 'daily'; interval: number }
    | { type: 'weekly'; days: DayOfWeek[] }
    | { type: 'monthly'; dates: number[] }
    | { type: 'after'; days: number }
    | { type: 'every'; days: number }
    | { type: 'nth_day'; instance: number; day: DayOfWeek }
    | { type: 'yearly'; date: string }; // "MM-DD"

export type ScheduleFrequency = {
    type: 'schedule';
    expression: string; // e.g. "every month on day 1" (default due anchor), "every 7 days from completion"
};

export type Frequency = LegacyFrequency | ScheduleFrequency | { type: 'none' };

type ParsedSchedule =
    | { kind: 'none'; anchor: 'due' | 'completion' }
    | { kind: 'interval_days'; days: number; anchor: 'due' | 'completion' }
    | { kind: 'weekday'; anchor: 'due' | 'completion' }
    | { kind: 'weekend'; anchor: 'due' | 'completion' }
    | { kind: 'weekly_days'; interval: number; days: number[]; anchor: 'due' | 'completion' }
    | { kind: 'interval_months'; months: number; anchor: 'due' | 'completion' }
    | { kind: 'monthly_days'; interval: number; dates: number[]; anchor: 'due' | 'completion' }
    | { kind: 'monthly_nth_weekday'; interval: number; instance: number; day: number; anchor: 'due' | 'completion' }
    | { kind: 'monthly_nth_weekdays'; interval: number; entries: Array<{ instance: number; day: number }>; anchor: 'due' | 'completion' }
    | { kind: 'interval_years'; years: number; anchor: 'due' | 'completion' }
    | { kind: 'yearly_dates'; interval: number; dates: Array<{ month: number; day: number }>; anchor: 'due' | 'completion' }
    | { kind: 'yearly_month_last_day'; interval: number; month: number; offset: number; anchor: 'due' | 'completion' };

// Distributive Omit so each union member keeps its own properties when 'anchor' is removed.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type ParsedScheduleWithoutAnchor = DistributiveOmit<ParsedSchedule, 'anchor'>;
type MonthlyParsedWithoutAnchor = Extract<ParsedScheduleWithoutAnchor, { kind: 'monthly_days' | 'monthly_nth_weekday' | 'monthly_nth_weekdays' }>;
type YearlyParsedWithoutAnchor = Extract<ParsedScheduleWithoutAnchor, { kind: 'yearly_dates' | 'yearly_month_last_day' }>;

const LEGACY_DAY_MAP: Record<DayOfWeek, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

const WEEKDAY_MAP: Record<WeekdayToken, number> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const MONTH_MAP: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const JP_WEEKDAY_MAP: Record<string, number> = {
    '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6,
    '日曜': 0, '月曜': 1, '火曜': 2, '水曜': 3, '木曜': 4, '金曜': 5, '土曜': 6,
    '日曜日': 0, '月曜日': 1, '火曜日': 2, '水曜日': 3, '木曜日': 4, '金曜日': 5, '土曜日': 6,
};

/** Format a Date object to 'YYYY-MM-DD' string */
export function toDateString(date: Date): string {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Parse a 'YYYY-MM-DD' string to a local Date object (midnight) */
export function fromDateString(str: string): Date {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function addDays(date: Date, n: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + n);
    return result;
}

function daysInMonth(year: number, monthZeroBased: number): number {
    return new Date(year, monthZeroBased + 1, 0).getDate();
}

function addMonthsClamped(date: Date, months: number): Date {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    const target = new Date(y, m + months, 1);
    const dim = daysInMonth(target.getFullYear(), target.getMonth());
    target.setDate(Math.min(d, dim));
    return target;
}

function addYearsClamped(date: Date, years: number): Date {
    const y = date.getFullYear() + years;
    const m = date.getMonth();
    const d = date.getDate();
    const dim = daysInMonth(y, m);
    return new Date(y, m, Math.min(d, dim));
}

function monthDiff(a: Date, b: Date): number {
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function yearDiff(a: Date, b: Date): number {
    return b.getFullYear() - a.getFullYear();
}

function startOfWeek(date: Date): Date {
    return addDays(date, -date.getDay());
}

function weekDiff(a: Date, b: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    const deltaDays = Math.floor((startOfWeek(b).getTime() - startOfWeek(a).getTime()) / msPerDay);
    return Math.floor(deltaDays / 7);
}

function normalize(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function repeatNumberToExpression(value: number): string {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`repeat number must be a positive integer: ${value}`);
    }
    return value === 1 ? 'every day' : `every ${value} days`;
}

function normalizeAsciiDigits(text: string): string {
    return text.replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xFF10));
}

function normalizeJapaneseCompletionAfterShorthand(value: string): string | null {
    const trimmed = normalizeAsciiDigits(value.trim());
    if (!trimmed) return null;

    const days = trimmed.match(/^(\d+)\s*日後$/);
    if (!days) return null;

    const n = Number(days[1]);
    if (!Number.isInteger(n) || n <= 0) return null;
    if (n === 1) return 'every day from completion';
    return `every ${n} days from completion`;
}

function normalizeWeekdaySeparatorText(text: string): string {
    return text
        .replace(/\u3000/g, ' ')
        // Common separators users are likely to type for weekday lists.
        .replace(/[，、,:：/／|｜;；・･]+/g, ',')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeMonthlyJapaneseRepeatShorthand(value: string): string | null {
    const trimmed = normalizeAsciiDigits(value.trim());
    if (!trimmed.startsWith('毎月')) return null;

    const body = trimmed.slice(2).trim(); // after "毎月"
    if (body === '末') return 'every month on last day';

    const lastDayOffset = body.match(/^末\s*[-−ー－]\s*(\d+)日$/);
    if (lastDayOffset) {
        return `every month on last day -${Number(lastDayOffset[1])}`;
    }

    const match = body.match(/^([0-9\s,，、/／:：;；・･]+)日$/);
    if (!match) return null;

    const rawList = match[1]
        .replace(/\u3000/g, ' ')
        .replace(/[，、/／:：;；・･]+/g, ',')
        .replace(/\s+/g, ',')
        .replace(/,+/g, ',')
        .replace(/^,|,$/g, '');

    if (!rawList) return null;
    const nums = rawList.split(',').filter(Boolean).map((v) => Number(v));
    if (nums.length === 0 || nums.some((n) => !Number.isInteger(n))) return null;

    if (nums.length === 1) return `every month on day ${nums[0]}`;
    return `every month on days ${nums.join(',')}`;
}

function ordinalToEnglish(n: number): string {
    if (n === 1) return '1st';
    if (n === 2) return '2nd';
    if (n === 3) return '3rd';
    return `${n}th`;
}

function parseJapaneseOrdinalToken(token: string): number | null {
    const trimmed = token.trim();
    if (!trimmed) return null;

    const asNumber = Number(trimmed);
    if (Number.isInteger(asNumber)) return asNumber;

    const kanjiMap: Record<string, number> = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    };
    return kanjiMap[trimmed] ?? null;
}

function normalizeMonthlyJapaneseNthWeekdayShorthand(value: string): string | null {
    const trimmed = normalizeAsciiDigits(value.trim());
    const lastMatch = trimmed.match(/^最終([日月火水木金土])(?:曜(?:日)?)?$/);
    if (lastMatch) {
        const dayMap: Record<string, string> = {
            '日': 'sun', '月': 'mon', '火': 'tue', '水': 'wed', '木': 'thu', '金': 'fri', '土': 'sat',
        };
        return `every month on last ${dayMap[lastMatch[1]]}`;
    }

    const match = trimmed.match(/^第([0-9一二三四五\s,，、]+)([日月火水木金土])(?:曜(?:日)?)?$/);
    if (!match) return null;

    const instancePart = match[1]
        .replace(/\u3000/g, ' ')
        .replace(/[，、]+/g, ',')
        .replace(/\s+/g, ',')
        .replace(/,+/g, ',')
        .replace(/^,|,$/g, '');
    if (!instancePart) return null;

    const instances = instancePart
        .split(',')
        .filter(Boolean)
        .map((v) => parseJapaneseOrdinalToken(v));
    if (instances.length === 0) return null;
    if (instances.some((n) => n === null || n < 1 || n > 5)) return null;
    const validInstances = instances.filter((n): n is number => n !== null);

    const dayMap: Record<string, string> = {
        '日': 'sun', '月': 'mon', '火': 'tue', '水': 'wed', '木': 'thu', '金': 'fri', '土': 'sat',
    };
    const dayToken = dayMap[match[2]];
    if (!dayToken) return null;

    const entries = validInstances.map((n) => `${ordinalToEnglish(n)} ${dayToken}`);
    return `every month on ${entries.join(',')}`;
}

function normalizeWeeklyJapaneseNaturalShorthand(value: string): string | null {
    const trimmed = normalizeAsciiDigits(value.trim());
    if (trimmed.startsWith('隔週')) {
        const body = trimmed.slice(2).trim().replace(/曜日/g, '').replace(/曜/g, '');
        if (!body) return null;
        try {
            parseWeekdayList(body);
            return `every 2 weeks on ${body}`;
        } catch {
            return null;
        }
    }

    if (!trimmed.startsWith('毎週')) return null;

    let body = trimmed.slice(2).trim();
    if (!body) return null;

    // Accept compact forms like "月水金" and natural forms like "月曜", "月曜日", "月・水・金曜日".
    body = body.replace(/曜日/g, '').replace(/曜/g, '');
    if (!body) return null;

    try {
        parseWeekdayList(body);
        return `every week on ${body}`;
    } catch {
        return null;
    }
}

function normalizeWeeklyRepeatShorthand(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Do not hijack explicit schedule-like expressions.
    if (trimmed.toLowerCase().startsWith('every ')) return null;
    if (/^(none|no)$/i.test(trimmed)) return null;

    try {
        const normalizedWeekdays = normalizeWeekdaySeparatorText(trimmed);
        parseWeekdayList(normalizedWeekdays);
        return `every week on ${normalizedWeekdays}`;
    } catch {
        return null;
    }
}

export function normalizeRepeatExpression(value: string | number): string {
    if (typeof value === 'number') {
        if (value === 0) return 'none';
        return repeatNumberToExpression(value);
    }

    const trimmed = value.trim();
    if (!trimmed) throw new Error('repeat must not be empty');

    if (trimmed === '0') return 'none';

    if (/^\d+$/.test(trimmed)) {
        return repeatNumberToExpression(Number(trimmed));
    }

    const japaneseCompletionAfterShorthand = normalizeJapaneseCompletionAfterShorthand(trimmed);
    if (japaneseCompletionAfterShorthand) return japaneseCompletionAfterShorthand;

    const monthlyJapaneseShorthand = normalizeMonthlyJapaneseRepeatShorthand(trimmed);
    if (monthlyJapaneseShorthand) return monthlyJapaneseShorthand;

    const monthlyJapaneseNthWeekdayShorthand = normalizeMonthlyJapaneseNthWeekdayShorthand(trimmed);
    if (monthlyJapaneseNthWeekdayShorthand) return monthlyJapaneseNthWeekdayShorthand;

    const weeklyJapaneseNaturalShorthand = normalizeWeeklyJapaneseNaturalShorthand(trimmed);
    if (weeklyJapaneseNaturalShorthand) return weeklyJapaneseNaturalShorthand;

    const weeklyShorthand = normalizeWeeklyRepeatShorthand(trimmed);
    if (weeklyShorthand) return weeklyShorthand;

    return trimmed;
}

function resolveMonthlyDay(dayToken: number, year: number, monthZeroBased: number): number | null {
    const dim = daysInMonth(year, monthZeroBased);
    const resolved = dayToken < 0 ? dim + dayToken + 1 : dayToken;
    if (resolved < 1 || resolved > dim) return null;
    return resolved;
}

function nthWeekdayOfMonth(year: number, monthZeroBased: number, weekday: number, instance: number): number | null {
    const dim = daysInMonth(year, monthZeroBased);
    if (instance > 0) {
        let seen = 0;
        for (let d = 1; d <= dim; d++) {
            if (new Date(year, monthZeroBased, d).getDay() === weekday) {
                seen++;
                if (seen === instance) return d;
            }
        }
        return null;
    }

    let remaining = -instance;
    for (let d = dim; d >= 1; d--) {
        if (new Date(year, monthZeroBased, d).getDay() === weekday) {
            remaining--;
            if (remaining === 0) return d;
        }
    }
    return null;
}

function searchFuture(baseDate: Date, maxDays: number, predicate: (candidate: Date) => boolean): Date {
    let candidate = addDays(baseDate, 1);
    for (let i = 0; i < maxDays; i++) {
        if (predicate(candidate)) return candidate;
        candidate = addDays(candidate, 1);
    }
    throw new Error('Could not find the next due date from schedule');
}

function parseWeekdayList(text: string): number[] {
    const normalized = normalizeWeekdaySeparatorText(text);
    if (!normalized) throw new Error(`Invalid weekday list: "${text}"`);

    const candidates = normalized.includes(',')
        ? normalized.split(',').map(v => v.trim()).filter(Boolean)
        : normalized.split(/\s+/).map(v => v.trim()).filter(Boolean);

    const expandToken = (token: string): string[] => {
        const lower = token.toLowerCase();
        if (lower in WEEKDAY_MAP || token in JP_WEEKDAY_MAP) return [token];

        // Support compact Japanese forms such as "月水金" (no comma/space).
        const compact = token.replace(/曜日/g, '').replace(/曜/g, '');
        if (/^[月火水木金土日]+$/.test(compact) && compact.length > 1) {
            return compact.split('');
        }
        return [token];
    };

    const flattened = candidates.flatMap(expandToken);
    if (flattened.length === 0) throw new Error(`Invalid weekday list: "${text}"`);

    const mapped = flattened.map((token) => {
        const lower = token.toLowerCase();
        if (lower in WEEKDAY_MAP) return WEEKDAY_MAP[lower as WeekdayToken];
        if (token in JP_WEEKDAY_MAP) return JP_WEEKDAY_MAP[token];
        throw new Error(`Invalid weekday token: "${token}"`);
    });

    return Array.from(new Set(mapped));
}

function parseMonthlyOn(text: string): MonthlyParsedWithoutAnchor {
    const dayMatch = text.match(/^day\s+(-?\d+)$/);
    if (dayMatch) {
        return { kind: 'monthly_days', interval: 1, dates: [Number(dayMatch[1])] };
    }

    const lastDayMatch = text.match(/^last day(?:\s*-\s*(\d+))?$/);
    if (lastDayMatch) {
        const offset = Number(lastDayMatch[1] ?? 0);
        return { kind: 'monthly_days', interval: 1, dates: [-(offset + 1)] };
    }

    const daysMatch = text.match(/^days\s+(.+)$/);
    if (daysMatch) {
        const body = daysMatch[1];
        const parts = body.split(',').map(v => v.trim()).filter(Boolean);
        const all: number[] = [];
        for (const part of parts) {
            const range = part.match(/^(-?\d+)\.\.(-?\d+)$/);
            if (range) {
                const start = Number(range[1]);
                const end = Number(range[2]);
                const step = start <= end ? 1 : -1;
                for (let v = start; v !== end + step; v += step) all.push(v);
                continue;
            }
            const num = Number(part);
            if (Number.isNaN(num)) throw new Error(`Invalid monthly day token: "${part}"`);
            all.push(num);
        }
        return { kind: 'monthly_days', interval: 1, dates: Array.from(new Set(all)) };
    }

    const nthList = text.split(',').map(v => v.trim()).filter(Boolean);
    const nthEntries = nthList.map((token) => token.match(/^(1st|2nd|3rd|4th|5th|last)\s+(mon|tue|wed|thu|fri|sat|sun)$/));
    if (nthList.length > 1 && nthEntries.every(Boolean)) {
        const validEntries = nthEntries.filter((m): m is RegExpMatchArray => m !== null);
        const entries = validEntries.map((m) => {
            const rawInstance = m[1];
            const instance = rawInstance === 'last' ? -1 : Number(rawInstance[0]);
            const day = WEEKDAY_MAP[m[2] as WeekdayToken];
            return { instance, day };
        });
        return { kind: 'monthly_nth_weekdays', interval: 1, entries };
    }

    const nthMatch = text.match(/^(1st|2nd|3rd|4th|5th|last)\s+(mon|tue|wed|thu|fri|sat|sun)$/);
    if (nthMatch) {
        const rawInstance = nthMatch[1];
        const instance = rawInstance === 'last' ? -1 : Number(rawInstance[0]);
        const day = WEEKDAY_MAP[nthMatch[2] as WeekdayToken];
        return { kind: 'monthly_nth_weekday', interval: 1, instance, day };
    }

    throw new Error(`Unsupported monthly schedule: "${text}"`);
}

function parseYearlyOn(text: string): YearlyParsedWithoutAnchor {
    const normalized = text.trim().replace(/，/g, ',');
    const listTokens = normalized.includes(',')
        ? normalized.split(',').map(v => v.trim()).filter(Boolean)
        : [normalized];

    const parsedDates = listTokens.map(parseYearlyDateToken).filter((v): v is { month: number; day: number } => v !== null);
    if (parsedDates.length === listTokens.length && parsedDates.length > 0) {
        return { kind: 'yearly_dates', interval: 1, dates: parsedDates };
    }

    const monthLastDayMatch = text.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+last day(?:\s*-\s*(\d+))?$/);
    if (monthLastDayMatch) {
        const month = MONTH_MAP[monthLastDayMatch[1]];
        const offset = Number(monthLastDayMatch[2] ?? 0);
        return { kind: 'yearly_month_last_day', interval: 1, month, offset };
    }

    const numericMonthLastDayMatch = text.match(/^(\d{1,2})月\s+last day(?:\s*-\s*(\d+))?$/);
    if (numericMonthLastDayMatch) {
        const month = Number(numericMonthLastDayMatch[1]);
        if (!isValidMonth(month)) throw new Error(`Invalid month in yearly schedule: "${text}"`);
        const offset = Number(numericMonthLastDayMatch[2] ?? 0);
        return { kind: 'yearly_month_last_day', interval: 1, month, offset };
    }

    throw new Error(`Unsupported yearly schedule: "${text}"`);
}

function isValidMonth(month: number): boolean {
    return Number.isInteger(month) && month >= 1 && month <= 12;
}

function isValidMonthDay(month: number, day: number): boolean {
    if (!isValidMonth(month)) return false;
    if (!Number.isInteger(day) || day < 1) return false;
    const maxDay = daysInMonth(2024, month - 1); // leap year baseline: allow 2/29
    return day <= maxDay;
}

function parseYearlyDateToken(token: string): { month: number; day: number } | null {
    const isoLike = token.match(/^(\d{2})-(\d{2})$/);
    if (isoLike) {
        const month = Number(isoLike[1]);
        const day = Number(isoLike[2]);
        if (!isValidMonthDay(month, day)) throw new Error(`Invalid month/day token: "${token}"`);
        return { month, day };
    }

    const japanese = token.match(/^(\d{1,2})月(\d{1,2})日$/);
    if (japanese) {
        const month = Number(japanese[1]);
        const day = Number(japanese[2]);
        if (!isValidMonthDay(month, day)) throw new Error(`Invalid month/day token: "${token}"`);
        return { month, day };
    }

    const compact = token.match(/^(\d{4})$/); // MMDD
    if (compact) {
        const month = Number(compact[1].slice(0, 2));
        const day = Number(compact[1].slice(2, 4));
        if (!isValidMonthDay(month, day)) throw new Error(`Invalid month/day token: "${token}"`);
        return { month, day };
    }

    return null;
}

export function parseScheduleExpression(expression: string): ParsedSchedule {
    const normalized = normalize(expression);
    if (normalized === 'none' || normalized === 'no') {
        return { kind: 'none', anchor: 'due' };
    }
    if (!normalized.startsWith('every ')) {
        throw new Error(`Schedule must start with "every": "${expression}"`);
    }

    let body = normalized;
    let anchor: 'due' | 'completion' = 'due';
    if (body.endsWith(' from due')) {
        anchor = 'due';
        body = body.slice(0, -' from due'.length);
    } else if (body.endsWith(' from completion')) {
        anchor = 'completion';
        body = body.slice(0, -' from completion'.length);
    } else if (/\sfrom\s/.test(body)) {
        throw new Error('Only "from due" or "from completion" is supported in schedule expressions');
    }

    const everyPart = body.slice('every '.length).trim();
    if (everyPart === 'day') return { kind: 'interval_days', days: 1, anchor };
    if (everyPart === 'weekday') return { kind: 'weekday', anchor };
    if (everyPart === 'weekend day') return { kind: 'weekend', anchor };

    const match = everyPart.match(/^(?:(\d+)\s+)?(day|days|week|weeks|month|months|year|years)(?:\s+on\s+(.+))?$/);
    if (!match) throw new Error(`Unsupported schedule expression: "${expression}"`);

    const interval = Number(match[1] ?? '1');
    if (!Number.isInteger(interval) || interval <= 0) {
        throw new Error(`Interval must be a positive integer: "${expression}"`);
    }
    const unit = match[2];
    const onPart = match[3];

    if (unit === 'day' || unit === 'days') {
        if (onPart) throw new Error('Day-based schedule does not support "on ..."');
        return { kind: 'interval_days', days: interval, anchor };
    }

    if (unit === 'week' || unit === 'weeks') {
        if (!onPart) return { kind: 'interval_days', days: interval * 7, anchor };
        return { kind: 'weekly_days', interval, days: parseWeekdayList(onPart), anchor };
    }

    if (unit === 'month' || unit === 'months') {
        if (!onPart) return { kind: 'interval_months', months: interval, anchor };
        const parsed = parseMonthlyOn(onPart);
        if (parsed.kind === 'monthly_days') return { ...parsed, interval, anchor };
        return { ...parsed, interval, anchor };
    }

    if (!onPart) return { kind: 'interval_years', years: interval, anchor };
    const parsedYear = parseYearlyOn(onPart);
    if (parsedYear.kind === 'yearly_dates') return { ...parsedYear, interval, anchor };
    return { ...parsedYear, interval, anchor };
}

export function parseRepeatExpression(value: string | number): ParsedSchedule {
    return parseScheduleExpression(normalizeRepeatExpression(value));
}

export function usesCompletionAnchor(frequency: Frequency): boolean {
    if (frequency.type === 'none') return false;
    if (frequency.type === 'after') return true;
    if (frequency.type !== 'schedule') return false;
    return parseScheduleExpression(frequency.expression).anchor === 'completion';
}

export function usesDueAnchor(frequency: Frequency): boolean {
    if (frequency.type !== 'schedule') return false;
    return parseScheduleExpression(frequency.expression).anchor === 'due';
}

function calculateNextDueFromSchedule(parsed: ParsedSchedule, baseDate: Date): string {
    switch (parsed.kind) {
        case 'none':
            // 'none' should be filtered upstream (frequency.type === 'none' check). If we reach here,
            // the caller passed an invalid expression and we surface it rather than silently returning ''.
            throw new Error('Cannot calculate next due for "none" schedule');

        case 'interval_days':
            return toDateString(addDays(baseDate, parsed.days));

        case 'weekday':
            return toDateString(searchFuture(baseDate, 14, (d) => d.getDay() >= 1 && d.getDay() <= 5));

        case 'weekend':
            return toDateString(searchFuture(baseDate, 14, (d) => d.getDay() === 0 || d.getDay() === 6));

        case 'weekly_days':
            return toDateString(searchFuture(baseDate, 366 * 3, (d) => {
                if (!parsed.days.includes(d.getDay())) return false;
                return weekDiff(baseDate, d) % parsed.interval === 0;
            }));

        case 'interval_months':
            return toDateString(addMonthsClamped(baseDate, parsed.months));

        case 'monthly_days':
            return toDateString(searchFuture(baseDate, 366 * 5, (d) => {
                const diff = monthDiff(baseDate, d);
                if (diff % parsed.interval !== 0) return false;
                const resolved = parsed.dates
                    .map((raw) => resolveMonthlyDay(raw, d.getFullYear(), d.getMonth()))
                    .filter((v): v is number => v !== null);
                return resolved.includes(d.getDate());
            }));

        case 'monthly_nth_weekday':
            return toDateString(searchFuture(baseDate, 366 * 5, (d) => {
                const diff = monthDiff(baseDate, d);
                if (diff % parsed.interval !== 0) return false;
                const nth = nthWeekdayOfMonth(d.getFullYear(), d.getMonth(), parsed.day, parsed.instance);
                return nth === d.getDate();
            }));

        case 'monthly_nth_weekdays':
            return toDateString(searchFuture(baseDate, 366 * 5, (d) => {
                const diff = monthDiff(baseDate, d);
                if (diff % parsed.interval !== 0) return false;
                return parsed.entries.some((entry) => {
                    const nth = nthWeekdayOfMonth(d.getFullYear(), d.getMonth(), entry.day, entry.instance);
                    return nth === d.getDate();
                });
            }));

        case 'interval_years':
            return toDateString(addYearsClamped(baseDate, parsed.years));

        case 'yearly_dates':
            return toDateString(searchFuture(baseDate, 366 * 20, (d) => {
                const diff = yearDiff(baseDate, d);
                if (diff % parsed.interval !== 0) return false;
                return parsed.dates.some((date) => date.month === d.getMonth() + 1 && date.day === d.getDate());
            }));

        case 'yearly_month_last_day':
            return toDateString(searchFuture(baseDate, 366 * 20, (d) => {
                const diff = yearDiff(baseDate, d);
                if (diff % parsed.interval !== 0) return false;
                if (d.getMonth() + 1 !== parsed.month) return false;
                const dim = daysInMonth(d.getFullYear(), d.getMonth());
                return d.getDate() === dim - parsed.offset;
            }));
    }
}

/**
 * Calculate the next due date based on frequency and base date.
 * `baseDate` must already be selected by the caller:
 * - completion-date anchor -> completion date
 * - scheduled-date anchor -> current next_due (or completion date fallback)
 */
export function calculateNextDue(frequency: Frequency, baseDate: Date): string | null {
    switch (frequency.type) {
        case 'none':
            return null;

        case 'daily':
            return toDateString(addDays(baseDate, frequency.interval));

        case 'weekly': {
            const targetDays = frequency.days.map(d => LEGACY_DAY_MAP[d]);
            const next = searchFuture(baseDate, 14, (d) => targetDays.includes(d.getDay()));
            return toDateString(next);
        }

        case 'monthly': {
            const next = searchFuture(baseDate, 366 * 5, (d) => {
                const resolvedDates = frequency.dates
                    .map(raw => resolveMonthlyDay(raw, d.getFullYear(), d.getMonth()))
                    .filter((v): v is number => v !== null);
                return resolvedDates.includes(d.getDate());
            });
            return toDateString(next);
        }

        case 'after':
            return toDateString(addDays(baseDate, frequency.days));

        case 'every':
            return toDateString(addDays(baseDate, frequency.days));

        case 'nth_day': {
            const dayNum = LEGACY_DAY_MAP[frequency.day];
            const next = searchFuture(baseDate, 366 * 5, (d) => {
                return nthWeekdayOfMonth(d.getFullYear(), d.getMonth(), dayNum, frequency.instance) === d.getDate();
            });
            return toDateString(next);
        }

        case 'yearly': {
            const [mm, dd] = frequency.date.split('-').map(Number);
            const next = searchFuture(baseDate, 366 * 5, (d) => d.getMonth() + 1 === mm && d.getDate() === dd);
            return toDateString(next);
        }

        case 'schedule':
            return calculateNextDueFromSchedule(parseScheduleExpression(frequency.expression), baseDate);
    }
}
