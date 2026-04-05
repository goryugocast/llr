export interface DailyNoteDescriptor {
    path: string;
    basename: string;
    extension: string;
}

export interface DailyNoteSettings {
    enabled: boolean;
    format: string;
    folder: string;
}

export function isDailyNoteMatch(
    file: DailyNoteDescriptor,
    settings: DailyNoteSettings,
    parseDate: (basename: string, format: string) => Date | null
): boolean {
    if (file.extension !== 'md') return false;
    if (!settings.enabled) return false;

    const folder = settings.folder.trim();
    if (folder) {
        if (!file.path.startsWith(`${folder}/`)) return false;
        const rest = file.path.slice(folder.length + 1);
        if (rest.includes('/')) return false;
    } else if (file.path.includes('/')) {
        return false;
    }

    return parseDate(file.basename, settings.format.trim()) !== null;
}

export function resolveDailyNoteDate(
    file: DailyNoteDescriptor,
    settings: DailyNoteSettings,
    parseDate: (basename: string, format: string) => Date | null
): Date | null {
    if (!isDailyNoteMatch(file, settings, parseDate)) return null;
    return parseDate(file.basename, settings.format.trim());
}

export function resolveReferenceDate(primaryDate: Date | null, fallbackDate: Date): Date {
    return primaryDate ? new Date(primaryDate) : new Date(fallbackDate);
}

function toDateOnlyTime(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function resolveMutationReferenceDate(primaryDate: Date | null, fallbackDate: Date): Date {
    if (!primaryDate) return new Date(fallbackDate);
    if (toDateOnlyTime(primaryDate) > toDateOnlyTime(fallbackDate)) {
        return new Date(fallbackDate);
    }
    return new Date(primaryDate);
}
