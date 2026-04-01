const DEFAULT_CUTOFF_HHMM = '0300';

export function normalizeCutoffTimeHHmm(cutoffTimeHHmm = DEFAULT_CUTOFF_HHMM): string {
    if (!/^\d{4}$/.test(cutoffTimeHHmm)) return DEFAULT_CUTOFF_HHMM;

    const hours = Number(cutoffTimeHHmm.slice(0, 2));
    const minutes = Number(cutoffTimeHHmm.slice(2, 4));
    const isValid = hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
    return isValid ? cutoffTimeHHmm : DEFAULT_CUTOFF_HHMM;
}

export function parseCutoffMinutes(cutoffTimeHHmm = DEFAULT_CUTOFF_HHMM): number {
    const normalized = normalizeCutoffTimeHHmm(cutoffTimeHHmm);
    const hours = Number(normalized.slice(0, 2));
    const minutes = Number(normalized.slice(2, 4));
    return hours * 60 + minutes;
}

export function normalizeMinutesForCutoffTimeline(
    minutes: number,
    cutoffTimeHHmm = DEFAULT_CUTOFF_HHMM
): number {
    const cutoffMinutes = parseCutoffMinutes(cutoffTimeHHmm);
    return minutes < cutoffMinutes ? minutes + 1440 : minutes;
}
