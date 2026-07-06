export function routineSortKey(r: { section?: number; start?: number }): [number, number] {
    const sec = r.section === undefined ? Infinity : r.section;
    const start = r.start ?? -Infinity;
    return [sec, start];
}
