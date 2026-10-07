import { sectionTimelineMinute } from './section-timeline';

export function expandRoutineNotesBySection<T extends { section?: number[] }>(
    items: T[]
): Array<Omit<T, 'section'> & { section: number | undefined }> {
    const result: Array<Omit<T, 'section'> & { section: number | undefined }> = [];
    for (const item of items) {
        const { section, ...rest } = item;
        if (!section || section.length === 0) {
            result.push({ ...rest, section: undefined } as Omit<T, 'section'> & { section: number | undefined });
            continue;
        }
        for (const value of section) {
            result.push({ ...rest, section: value } as Omit<T, 'section'> & { section: number | undefined });
        }
    }
    return result;
}

export function routineSortKey(r: { section?: number; start?: number }): [number, number] {
    // Extended sections explicitly reserve trailing slots (notably sleep at 2400).
    // Keep them after every clock-time section, including 00:00–02:59, so the
    // summary's sleep boundary cannot hide newly inserted midnight tasks.
    const sec = r.section === undefined ? Infinity
        : sectionTimelineMinute(r.section) + (r.section >= 2400 ? 1440 : 0);
    const start = r.start === undefined ? -Infinity : sectionTimelineMinute(r.start);
    return [sec, start];
}

export function groupRoutineLinesWithSections(
    items: { line: string; sectionHeading: string | null }[]
): string[] {
    const output: string[] = [];
    let currentHeading: string | null | undefined = undefined;

    for (const item of items) {
        if (item.sectionHeading !== currentHeading) {
            if (item.sectionHeading !== null) {
                output.push(item.sectionHeading);
            } else if (currentHeading !== null && currentHeading !== undefined) {
                output.push('');
            }
            currentHeading = item.sectionHeading;
        }
        output.push(item.line);
    }

    return output;
}
