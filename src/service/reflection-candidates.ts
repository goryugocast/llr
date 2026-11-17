/** Select by estimate, then lay out selected candidates in source order.
 * Hour numbers are absolute on the logical-day axis, including after midnight. */
export function selectReflectionCandidates(
    candidates: readonly { id: number; estimate: number }[],
    hours: readonly number[],
): Map<number, number> {
    const take = (available: number[], count: number): number[] => {
        let best: number[] = [];
        let run: number[] = [];
        for (const hour of available) {
            if (run.length && hour !== run[run.length - 1] + 1) run = [];
            run.push(hour);
            if (run.length > best.length) best = [...run];
            if (run.length === count) break;
        }
        return best.slice(0, count);
    };
    let available = [...hours].sort((a, b) => a - b);
    const selected = new Map<number, number>();
    const ranked = candidates.map((candidate, index) => ({ ...candidate, index }))
        .sort((a, b) => b.estimate - a.estimate || a.index - b.index);
    for (const candidate of ranked) {
        if (!available.length) break;
        const reserved = take(available, Math.max(1, Math.ceil(candidate.estimate / 60)));
        selected.set(candidate.id, reserved.length);
        available = available.filter(hour => !reserved.includes(hour));
    }
    available = [...hours].sort((a, b) => a - b);
    const result = new Map<number, number>();
    for (const candidate of candidates) {
        const count = selected.get(candidate.id);
        if (!count) continue;
        // Keep source order even when an occupied hour splits the free slots.
        const reserved: number[] = [];
        for (const hour of available) {
            if (reserved.length && hour !== reserved[reserved.length - 1] + 1) break;
            reserved.push(hour);
            if (reserved.length === count) break;
        }
        for (const hour of reserved) result.set(hour, candidate.id);
        available = available.filter(hour => !reserved.includes(hour));
    }
    return new Map([...result].sort(([a], [b]) => a - b));
}
