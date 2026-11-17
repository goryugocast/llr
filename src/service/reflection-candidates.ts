export interface ReflectionCandidate {
    id: number;
    estimate: number;
    startMinute?: number;
    endMinute?: number;
    fixed?: boolean;
}

/** Compare untimed remaining estimates with fixed plans' actual hourly overlap.
 * Hours are absolute on the logical-day axis. Input order breaks score ties. */
export function selectReflectionCandidates(
    candidates: readonly ReflectionCandidate[],
    hours: readonly number[],
): Map<number, number> {
    const remaining = new Map(candidates.map(candidate => [candidate.id, candidate.estimate]));
    const used = new Set<number>();
    const result = new Map<number, number>();
    let previousHour = -Infinity;
    let previousId: number | undefined;
    for (const hour of [...hours].sort((a, b) => a - b)) {
        const eligible = candidates.filter(candidate => {
            if ((candidate.startMinute ?? -Infinity) >= (hour + 1) * 60 || (candidate.endMinute ?? Infinity) <= hour * 60) return false;
            if (candidate.fixed || !used.has(candidate.id)) return true;
            return previousHour === hour - 1 && previousId === candidate.id && (remaining.get(candidate.id) ?? 0) > 30;
        });
        let best: ReflectionCandidate | undefined;
        let bestScore = -1;
        for (const candidate of eligible) {
            const rest = remaining.get(candidate.id) ?? 0;
            if (!candidate.fixed && used.has(candidate.id) && rest <= 45 && eligible.some(other => other.id !== candidate.id)) continue;
            const score = candidate.fixed
                ? Math.max(0, Math.min(candidate.endMinute ?? Infinity, (hour + 1) * 60) - Math.max(candidate.startMinute ?? -Infinity, hour * 60))
                : rest;
            if (score > bestScore) { best = candidate; bestScore = score; }
        }
        if (best) {
            result.set(hour, best.id);
            if (!best.fixed) {
                used.add(best.id);
                remaining.set(best.id, Math.max(0, (remaining.get(best.id) ?? 0) - 60));
            }
        }
        previousHour = hour;
        previousId = best?.id;
    }
    return result;
}
