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

/**
 * デイリーノートのフォルダを解決する。
 *
 * LLR は「Daily Notes プラグインに乗っかる」コンセプトなので、プラグインが folder を
 * 返している間は常にそれが真実の源。プラグイン側 folder が空（クラウド同期で設定が
 * 巻き戻った等）のときだけ、ユーザーが LLR 設定に書いた補完値を使う。
 *
 * この優先順は getDailyNoteSettings()（判定）と getDailyNotePathCandidates()（パス生成）の
 * 両方で共有しなければならない。片方だけ変えると「判定と生成のフォルダがズレる」非対称バグになる。
 */
export function resolveDailyNoteFolder(pluginFolder: string, fallbackFolder: string): string {
    return pluginFolder.trim() || fallbackFolder.trim();
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
