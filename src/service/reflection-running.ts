/** Choose only the current representative. Never rewrite source task states.
 * Completed successors remain evidence of handoff so stale running rows do not
 * regain the representative after a successor ends or the view reloads. */
export function currentReflectionRunningId(
    tasks: readonly { id: number; status: string; startMinute: number | null }[],
    now: number,
): number | null {
    const events = tasks.filter(task => task.startMinute !== null && task.startMinute <= now && (task.status === '/' || task.status === 'x'))
        .sort((a, b) => a.startMinute - b.startMinute || a.id - b.id);
    let anchor = events.find(task => task.status === '/');
    if (!anchor) return null;
    for (const event of events) {
        if (event.startMinute <= anchor.startMinute) continue;
        if (event.startMinute - anchor.startMinute >= 60 || (anchor.status === 'x' && event.status === '/')) anchor = event;
    }
    return anchor.status === '/' ? anchor.id : null;
}
