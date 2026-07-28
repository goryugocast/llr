export interface DailyNoteDescriptor {
    path: string;
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

/**
 * デイリーノートのフォルダ相対パス（拡張子抜き）を返す。フォルダ外なら null。
 *
 * Daily Notes プラグインは format にスラッシュを含められる（例: YYYY/MM/YYYY-MM-DD）。
 * その場合ノートはサブフォルダに作られるので、basename 単体ではなく相対パス全体を
 * format で照合しないと一致しない。「フォルダ直下か」の判定は format との strict 照合が
 * 兼ねる: format にスラッシュが無ければ、スラッシュ入りの相対パスはパースに失敗する。
 */
function dailyNoteDateString(file: DailyNoteDescriptor, settings: DailyNoteSettings): string | null {
    if (file.extension !== 'md') return null;
    if (!settings.enabled) return null;

    const folder = settings.folder.trim();
    let rest = file.path;
    if (folder) {
        if (!file.path.startsWith(`${folder}/`)) return null;
        rest = file.path.slice(folder.length + 1);
    }
    return rest.replace(/\.md$/, '');
}

export function isDailyNoteMatch(
    file: DailyNoteDescriptor,
    settings: DailyNoteSettings,
    parseDate: (dateString: string, format: string) => Date | null
): boolean {
    return resolveDailyNoteDate(file, settings, parseDate) !== null;
}

export function resolveDailyNoteDate(
    file: DailyNoteDescriptor,
    settings: DailyNoteSettings,
    parseDate: (dateString: string, format: string) => Date | null
): Date | null {
    const dateString = dailyNoteDateString(file, settings);
    if (dateString === null) return null;
    return parseDate(dateString, settings.format.trim());
}

export function resolveReferenceDate(primaryDate: Date | null, fallbackDate: Date): Date {
    return primaryDate ? new Date(primaryDate) : new Date(fallbackDate);
}

function toDateOnlyTime(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * 対象ノートの日付が runtime today より未来か。
 *
 * 未来ノートは preview 専用で、ルーチン正本を書き換える authority を持たない。
 * 素の完了検知 / `@done` / リスケジュールマーカーの3経路は、必ずこの判定で揃えて止める。
 * 片方だけ clamp・片方だけ block にすると「経路によって next_due の動きが変わる」非対称バグになる。
 * 詳細は docs/specs/未来日付デイリーノートとルーチン基準日ポリシー.md（必須ルール B / D）。
 *
 * デイリーノートとして解釈できないファイル（primaryDate が null）は未来ではない扱いにして、
 * 既存の「日付が読めないなら runtime today を使う」経路をそのまま通す。
 */
export function isFutureDailyNoteDate(noteDate: Date | null, now: Date): boolean {
    if (!noteDate) return false;
    return toDateOnlyTime(noteDate) > toDateOnlyTime(now);
}

/**
 * 状態更新に使う基準日。未来日は runtime today へ丸める。
 *
 * これは isFutureDailyNoteDate() で止めきれなかった経路のための二重防御であり、
 * 未来ノートの完了を成立させるための仕組みではない。
 */
export function resolveMutationReferenceDate(primaryDate: Date | null, fallbackDate: Date): Date {
    if (!primaryDate) return new Date(fallbackDate);
    if (toDateOnlyTime(primaryDate) > toDateOnlyTime(fallbackDate)) {
        return new Date(fallbackDate);
    }
    return new Date(primaryDate);
}
