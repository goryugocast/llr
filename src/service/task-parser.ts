/**
 * TaskParser: v2 文法の task line を status / body / planned / actual / duration / marker に分解・合成する。
 */

export type ParsedTaskStatus = ' ' | '/' | 'x' | '-' | 'plain';
export type ParsedTaskMarkerKind = 'atdone' | 'reschedule';

export interface ParsedTaskMarker {
    kind: ParsedTaskMarkerKind;
    raw: string;
    value: string;
    pending: boolean;
}

export interface ParsedTask {
    status: ParsedTaskStatus;
    body: string;
    content: string;
    plannedStart: string;
    actualStart: string;
    actualEnd: string;
    estimate: string;
    actualDuration: string;
    marker: ParsedTaskMarker | null;
    times: string[];
}

interface StatusExtraction {
    status: ParsedTaskStatus;
    remaining: string;
}

interface MarkerExtraction {
    marker: ParsedTaskMarker | null;
    remaining: string;
}

interface DurationExtraction {
    estimate: string;
    actualDuration: string;
    remaining: string;
}

interface ActualTimeExtraction {
    actualStart: string;
    actualEnd: string;
    remaining: string;
}

const STATUS_PATTERN = /^- \[( |\/|x)\]\s*/;
const PLAIN_DASH_PATTERN = /^-\s*/;
const RUNNING_ACTUAL_TAIL_PATTERN = /(?:^|\s)(\d{2}:\d{2})\s*-\s*$/;
const ACTUAL_RANGE_TAIL_PATTERN = /(?:^|\s)(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*$/;
const DONE_MARKER_TAIL_PATTERN = /(?:^|\s)([@＠]|→)done\s*$/i;
const RESCHEDULE_MARKER_TAIL_PATTERN = /(?:^|\s)([@＠]|→)(\d{4}-\d{1,2}-\d{1,2}|\d{4}|\d{1,2}\/\d{1,2}|\d{1,2}月\d{1,2}日)\s*$/;

export class TaskParser {
    static parseLine(line: string): ParsedTask {
        const { status, remaining: afterStatus } = this.extractStatus(line.trim());
        let remaining = afterStatus;

        const markerExtraction = this.extractMarkerFromTail(remaining);
        remaining = markerExtraction.remaining;

        const durationExtraction = this.extractDurationFromTail(remaining, status);
        remaining = durationExtraction.remaining;

        const actualExtraction = this.extractActualTimesFromTail(remaining);
        remaining = actualExtraction.remaining;

        const body = remaining.trim();
        const { plannedStart, content } = this.extractPlannedStartFromBody(body);

        return {
            status,
            body,
            content,
            plannedStart,
            actualStart: actualExtraction.actualStart,
            actualEnd: actualExtraction.actualEnd,
            estimate: durationExtraction.estimate,
            actualDuration: durationExtraction.actualDuration,
            marker: markerExtraction.marker,
            times: this.buildTimes(status, plannedStart, actualExtraction.actualStart, actualExtraction.actualEnd),
        };
    }

    static serialize(parsed: ParsedTask): string {
        const parts: string[] = [];

        if (parsed.status === 'plain') {
            parts.push('-');
        } else if (parsed.status === '-') {
            parts.push('-');
        } else {
            parts.push(`- [${parsed.status}]`);
        }

        const body = (parsed.body ?? '').trim() || this.buildBody(parsed.plannedStart ?? '', parsed.content ?? '');
        if (body) parts.push(body);

        const actual = this.buildActualText(parsed.actualStart ?? '', parsed.actualEnd ?? '');
        if (actual) parts.push(actual);

        const duration = this.buildDurationText(parsed.status, parsed.estimate ?? '', parsed.actualDuration ?? '');
        if (duration) parts.push(duration);

        if (parsed.marker) {
            parts.push(parsed.marker.raw);
        }

        return parts.join(' ').trimEnd();
    }

    static normalizeTime(input: string): string {
        const digits = input.replace(/\D/g, '');

        if (digits.length === 3) {
            const padded = digits.padStart(4, '0');
            return `${padded.slice(0, 2)}:${padded.slice(2)}`;
        }
        if (digits.length === 4) {
            return `${digits.slice(0, 2)}:${digits.slice(2)}`;
        }

        if (input.includes(':')) {
            const [h, m] = input.split(':');
            return `${h.padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
        }

        return input;
    }

    static normalizeLooseTimeToken(input: string): string | null {
        const normalized = this.normalizeTime(input);
        const match = normalized.match(/^(\d{2}):(\d{2})$/);
        if (!match) return null;

        const hh = Number(match[1]);
        const mm = Number(match[2]);
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
        return normalized;
    }

    static normalizeDurationToken(input: string): string | null {
        const trimmed = input.trim();

        const bareMinutes = trimmed.match(/^(\d{1,3})$/);
        if (bareMinutes) {
            return `${parseInt(bareMinutes[1], 10)}m`;
        }

        const unitMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(h|m|min)$/i);
        if (!unitMatch) return null;

        const value = Number(unitMatch[1]);
        const unit = unitMatch[2].toLowerCase();
        if (!Number.isFinite(value)) return null;

        if (unit === 'h') {
            return `${Math.floor(value * 60)}m`;
        }

        return `${Math.floor(value)}m`;
    }

    private static extractStatus(line: string): StatusExtraction {
        const statusMatch = line.match(STATUS_PATTERN);
        if (statusMatch) {
            return {
                status: statusMatch[1] as ParsedTaskStatus,
                remaining: line.slice(statusMatch[0].length).trim(),
            };
        }

        if (line.match(PLAIN_DASH_PATTERN)) {
            return {
                status: 'plain',
                remaining: line.replace(PLAIN_DASH_PATTERN, '').trim(),
            };
        }

        return {
            status: 'plain',
            remaining: line.trim(),
        };
    }

    private static extractMarkerFromTail(text: string): MarkerExtraction {
        const doneMatch = text.match(DONE_MARKER_TAIL_PATTERN);
        if (doneMatch && doneMatch.index !== undefined) {
            const raw = doneMatch[0].trim();
            return {
                marker: {
                    kind: 'atdone',
                    raw,
                    value: 'done',
                    pending: raw.startsWith('@') || raw.startsWith('＠'),
                },
                remaining: text.slice(0, doneMatch.index).trimEnd(),
            };
        }

        const rescheduleMatch = text.match(RESCHEDULE_MARKER_TAIL_PATTERN);
        if (rescheduleMatch && rescheduleMatch.index !== undefined) {
            const raw = rescheduleMatch[0].trim();
            return {
                marker: {
                    kind: 'reschedule',
                    raw,
                    value: rescheduleMatch[2],
                    pending: raw.startsWith('@') || raw.startsWith('＠'),
                },
                remaining: text.slice(0, rescheduleMatch.index).trimEnd(),
            };
        }

        return { marker: null, remaining: text.trimEnd() };
    }

    private static extractDurationFromTail(text: string, status: ParsedTaskStatus): DurationExtraction {
        const parenMatch = text.match(/\(([^()]+)\)\s*$/);
        if (parenMatch && parenMatch.index !== undefined) {
            const normalized = this.normalizeDurationExpression(parenMatch[1], status);
            if (normalized) {
                return {
                    ...normalized,
                    remaining: text.slice(0, parenMatch.index).trimEnd(),
                };
            }
        }

        const bareMatch = text.match(/(?:^|\s)(\d+(?:\.\d+)?\s*(?:h|m|min))\s*$/i);
        if (bareMatch && bareMatch.index !== undefined) {
            const normalized = this.normalizeDurationExpression(bareMatch[1], status);
            if (normalized) {
                return {
                    ...normalized,
                    remaining: text.slice(0, bareMatch.index).trimEnd(),
                };
            }
        }

        return { estimate: '', actualDuration: '', remaining: text.trimEnd() };
    }

    private static normalizeDurationExpression(
        raw: string,
        status: ParsedTaskStatus
    ): { estimate: string; actualDuration: string } | null {
        const comparisonMatch = raw.match(/^(.+?)\s*>\s*(.+)$/);
        if (comparisonMatch) {
            const estimate = this.normalizeDurationToken(comparisonMatch[1]);
            const actualDuration = this.normalizeDurationToken(comparisonMatch[2]);
            if (!estimate || !actualDuration) return null;
            return { estimate, actualDuration };
        }

        const single = this.normalizeDurationToken(raw);
        if (!single) return null;

        if (status === 'x') {
            return { estimate: '', actualDuration: single };
        }

        return { estimate: single, actualDuration: '' };
    }

    private static extractActualTimesFromTail(text: string): ActualTimeExtraction {
        const rangeMatch = text.match(ACTUAL_RANGE_TAIL_PATTERN);
        if (rangeMatch && rangeMatch.index !== undefined) {
            return {
                actualStart: rangeMatch[1],
                actualEnd: rangeMatch[2],
                remaining: text.slice(0, rangeMatch.index).trimEnd(),
            };
        }

        const runningMatch = text.match(RUNNING_ACTUAL_TAIL_PATTERN);
        if (runningMatch && runningMatch.index !== undefined) {
            return {
                actualStart: runningMatch[1],
                actualEnd: '',
                remaining: text.slice(0, runningMatch.index).trimEnd(),
            };
        }

        return {
            actualStart: '',
            actualEnd: '',
            remaining: text.trimEnd(),
        };
    }

    private static extractPlannedStartFromBody(body: string): { plannedStart: string; content: string } {
        const match = body.match(/^((?:\d{3,4}|\d{1,2}:\d{2}))(?:\s+|$)/);
        if (!match) {
            return {
                plannedStart: '',
                content: body.trim(),
            };
        }

        const normalized = this.normalizeLooseTimeToken(match[1]);
        if (!normalized) {
            return {
                plannedStart: '',
                content: body.trim(),
            };
        }

        const content = body.slice(match[0].length).trim();
        return {
            plannedStart: normalized,
            content,
        };
    }

    private static buildBody(plannedStart: string, content: string): string {
        return [plannedStart, content].filter(Boolean).join(' ').trim();
    }

    private static buildActualText(actualStart: string, actualEnd: string): string {
        if (actualStart && actualEnd) return `${actualStart} - ${actualEnd}`;
        if (actualStart) return `${actualStart} -`;
        return '';
    }

    private static buildDurationText(status: ParsedTaskStatus, estimate: string, actualDuration: string): string {
        if (estimate && actualDuration) return `(${estimate} > ${actualDuration})`;
        if (status === 'x' && actualDuration) return `(${actualDuration})`;
        if (estimate) return `(${estimate})`;
        return '';
    }

    private static buildTimes(
        status: ParsedTaskStatus,
        plannedStart: string,
        actualStart: string,
        actualEnd: string
    ): string[] {
        if (status === 'x') {
            return [actualStart, actualEnd].filter(Boolean);
        }
        if (status === '/') {
            return actualStart ? [actualStart] : [];
        }
        if (plannedStart) {
            return [plannedStart];
        }
        return [];
    }
}
