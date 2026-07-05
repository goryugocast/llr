import { App, TFile, moment } from 'obsidian';
import type { DailyNoteSettings } from './daily-note-context';

const DAILY_ROUTINE_TEMPLATE_MARKERS = [
    '{{llr-today}}',
    '{{llr-routines}}',
    '<!-- llr:insert-routine -->',
];
const DAILY_ROUTINE_EXPANDED_STAMP_PREFIX = '<!-- llr:routines-expanded ';

export interface DailyNoteAutoInsertDeps {
    isDailyNoteFile(file: TFile): boolean;
    parseDailyNoteDate(file: TFile): Date | null;
    getDailyNoteSettings(): DailyNoteSettings;
    buildRoutineInsertLines(targetDate: Date): Promise<string[]>;
    debugLog(message: string, data?: unknown): void;
}

/**
 * デイリーノート内のテンプレートマーカー（{{llr-today}} など）を、その日のルーチン一覧へ
 * 自動展開する。Templater 等が内容を後追いで埋めるケースに備え、create トリガでは短時間リトライする。
 *
 * 展開済みは stamp コメントで冪等化する。ルーチン行の生成（buildRoutineInsertLines）は
 * Insert Routine コマンドと共有なので delegate 経由で plugin に委ねる。
 */
export class DailyNoteAutoInsertController {
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(
        private readonly app: App,
        private readonly deps: DailyNoteAutoInsertDeps,
    ) {}

    schedule(file: TFile, attempt = 0, trigger: 'create' | 'open' | 'startup' = 'create'): void {
        if (!this.deps.isDailyNoteFile(file)) return;
        if (!this.shouldAttemptDeferredInsert(file, trigger)) return;
        if (attempt > 12) {
            this.timers.delete(file.path);
            return;
        }

        const existing = this.timers.get(file.path);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
            void this.tryExpandTemplateMarker(file, attempt, trigger);
        }, attempt === 0 ? 200 : 500);

        this.timers.set(file.path, timer);
    }

    tryStartup(): void {
        const file = this.resolveTodayDailyNoteFile();
        if (!file) return;
        this.schedule(file, 0, 'startup');
    }

    clearTimers(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
    }

    private resolveTodayDailyNoteFile(): TFile | null {
        const settings = this.deps.getDailyNoteSettings();
        if (!settings.enabled) return null;

        // format にスラッシュが入ると相対パス（例: 2026/07/2026-07-05）になる
        const relativePath = moment().format(settings.format.trim());
        const path = settings.folder.trim() ? `${settings.folder.trim()}/${relativePath}.md` : `${relativePath}.md`;
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? file : null;
    }

    private shouldAttemptDeferredInsert(file: TFile, trigger: 'create' | 'open' | 'startup'): boolean {
        if (trigger === 'create') return true;

        const fileDate = this.deps.parseDailyNoteDate(file);
        if (!fileDate) return false;

        const today = moment().format('YYYY-MM-DD');
        const target = moment(fileDate).format('YYYY-MM-DD');
        return target === today;
    }

    private buildExpandedStamp(targetDate: Date): string {
        return `${DAILY_ROUTINE_EXPANDED_STAMP_PREFIX}${moment(targetDate).format('YYYY-MM-DD')} -->`;
    }

    private async tryExpandTemplateMarker(
        file: TFile,
        attempt: number,
        trigger: 'create' | 'open' | 'startup'
    ): Promise<void> {
        try {
            if (!this.deps.isDailyNoteFile(file)) return;

            const content = await this.app.vault.read(file);
            if (content.includes(DAILY_ROUTINE_EXPANDED_STAMP_PREFIX)) return;
            const hasMarker = DAILY_ROUTINE_TEMPLATE_MARKERS.some((marker) => content.includes(marker));
            if (!hasMarker) {
                // Retry only when the file is still empty (template engine hasn't written yet).
                // Once content exists without a marker, the user isn't using LLR markers — stop.
                if (trigger === 'create' && content.trim().length === 0) {
                    this.schedule(file, attempt + 1, trigger);
                }
                return;
            }

            const targetDate = this.deps.parseDailyNoteDate(file) ?? new Date();
            const outputLines = await this.deps.buildRoutineInsertLines(targetDate);
            const stamp = this.buildExpandedStamp(targetDate);
            const block = [...outputLines, stamp].join('\n');

            let replaced = content;
            for (const marker of DAILY_ROUTINE_TEMPLATE_MARKERS) {
                if (!replaced.includes(marker)) continue;
                replaced = replaced.split(marker).join(block);
            }

            if (replaced !== content) {
                await this.app.vault.modify(file, replaced);
                this.deps.debugLog('Daily template marker expanded to routines', {
                    file: file.path,
                    date: targetDate.toISOString(),
                    lineCount: outputLines.length,
                    attempt,
                    trigger,
                });
            }
        } catch (error) {
            this.deps.debugLog('Daily template routine auto-insert failed', {
                file: file.path,
                attempt,
                trigger,
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            this.timers.delete(file.path);
        }
    }
}
