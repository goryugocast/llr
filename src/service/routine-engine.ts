/**
 * routine-engine.ts
 *
 * Obsidian-aware engine for the Routine feature.
 * Reads/updates YAML frontmatter on routine notes inside the `routine/` folder.
 * Implements debounce-based trigger: schedules YAML update after a configurable
 * delay (currently 0ms in debug phase; may be increased again later)
 * after task completion, cancels if reverted, and flushes on Obsidian close.
 */

import { App, TFile } from 'obsidian';
import { addDays, advanceDueUntil, calculateNextDue, fromDateString, normalizeAsciiDigits, normalizeRepeatExpression, resolveInitialDue, toDateString, type Frequency, usesCompletionAnchor, usesDueAnchor } from './yaml-parser';
import { parseCutoffMinutes } from './day-cutoff';

const DEFAULT_ROUTINE_FOLDER = 'routine';
// Grace period for undoing a mis-tapped checkbox. Metadata changes arrive ~80ms after the edit,
// so a revert within this window cancels the pending write. flushAll() on unload still commits
// anything outstanding, so a completion is never lost by closing Obsidian.
const DEBOUNCE_DELAY_MS = 3000;
const SRS_GROWTH_MIN = 2;
const SRS_GROWTH_MAX = 3;

export interface RoutineEngineDebugEvent {
    source: 'routine-engine';
    message: string;
    data?: unknown;
}

interface RoutineEngineOptions {
    onDebugEvent?: (event: RoutineEngineDebugEvent) => void;
    onNotice?: (message: string, timeout?: number) => void;
    routineFolder?: string;
    srsGrowthEnabled?: boolean;
}

export interface RoutineNote {
    file: TFile;
    estimate?: number;      // 省略可。展開時に (Xm) として付与
    start?: number;        // 省略可。HHmm 形式。展開時に単一時刻プレフィクスとして付与
    start_before?: number; // 省略可。next_due の何日前から表示するか（日数）
    section?: number[];    // 省略可。展開時のソート基準（時間帯の概念）。複数指定は要素数だけ複製表示。未設定は先頭
    frequency: Frequency;
    next_due?: string;
    rollover?: boolean;
    repeatExplicit?: boolean; // repeat/frequency/schedule が明示されていたか
    isSrs?: boolean;
}

export type RoutineCompletionMode = 'normal' | 'advanceFromDue';

export interface RoutineCompletionRequest {
    completionDate: Date;
    mode?: RoutineCompletionMode;
}

interface PendingRoutineUpdate {
    timer: ReturnType<typeof setTimeout>;
    request: RoutineCompletionRequest;
}

export function resolveDeferredDateByCutoff(now: Date, cutoffTimeHHmm = '0300'): Date {
    const cutoffTotalMinutes = parseCutoffMinutes(cutoffTimeHHmm);
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

    const target = new Date(now);
    target.setHours(0, 0, 0, 0);
    if (currentTotalMinutes >= cutoffTotalMinutes) {
        target.setDate(target.getDate() + 1);
    }
    return target;
}

export class RoutineEngine {
    private app: App;
    private routineFolder: string;
    private srsGrowthEnabled: boolean;
    private pendingTimers: Map<string, PendingRoutineUpdate> = new Map();
    private onDebugEvent?: (event: RoutineEngineDebugEvent) => void;
    private onNotice?: (message: string, timeout?: number) => void;

    constructor(app: App, options: RoutineEngineOptions = {}) {
        this.app = app;
        this.onDebugEvent = options.onDebugEvent;
        this.onNotice = options.onNotice;
        this.routineFolder = this.normalizeRoutineFolder(options.routineFolder);
        this.srsGrowthEnabled = options.srsGrowthEnabled ?? false;
    }

    setSrsGrowthEnabled(enabled: boolean): void {
        this.srsGrowthEnabled = enabled;
    }

    private normalizeRoutineFolder(value: unknown): string {
        return this.normalizeFolderName(value, DEFAULT_ROUTINE_FOLDER);
    }

    private normalizeFolderName(value: unknown, defaultName: string): string {
        const raw = typeof value === 'string' ? value.trim() : '';
        const stripped = raw.replace(/^\/+/, '').replace(/\/+$/, '');
        return stripped || defaultName;
    }

    setRoutineFolder(folder: string): void {
        this.routineFolder = this.normalizeRoutineFolder(folder);
        this.emitDebugEvent('routine-folder:updated', { routineFolder: this.routineFolder });
    }

    private isRoutineFile(file: TFile): boolean {
        const lowerPath = file.path.toLowerCase();
        const routePrefix = this.routineFolder.toLowerCase() + '/';
        return lowerPath.startsWith(routePrefix);
    }

    isSrsFile(file: TFile): boolean {
        if (!this.srsGrowthEnabled) return false;
        if (this.isRoutineFile(file)) return false;
        const cache = this.app.metadataCache.getFileCache(file);
        const repeat = cache?.frontmatter?.repeat;
        if (repeat === undefined || repeat === null) return false;
        const num = typeof repeat === 'string' ? Number(repeat) : repeat;
        return typeof num === 'number' && num > 0;
    }

    private isInManagedFolder(file: TFile): boolean {
        return this.isRoutineFile(file) || this.isSrsFile(file);
    }

    private emitDebugEvent(message: string, data?: unknown): void {
        this.onDebugEvent?.({
            source: 'routine-engine',
            message,
            data,
        });
    }

    private emitNotice(message: string, timeout = 5000): void {
        this.onNotice?.(message, timeout);
    }

    private normalizeToDateOnly(date: Date): Date {
        return fromDateString(toDateString(date));
    }

    private parseStartValue(raw: unknown): number | undefined {
        if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
        const value = Math.trunc(raw);
        const hh = Math.floor(value / 100);
        const mm = value % 100;
        if (hh < 0 || hh > 29 || mm < 0 || mm > 59) return undefined;
        return value;
    }

    private parseSectionElement(raw: unknown): number | undefined {
        if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
        if (typeof raw !== 'string') return undefined;
        const normalized = normalizeAsciiDigits(raw).trim();
        if (!normalized || Number.isNaN(Number(normalized))) return undefined;
        return Number(normalized);
    }

    private parseSectionValue(raw: unknown): number[] | undefined {
        const source = Array.isArray(raw) ? raw : [raw];
        const values: number[] = [];
        for (const item of source) {
            const value = this.parseSectionElement(item);
            if (value !== undefined && !values.includes(value)) values.push(value);
        }
        return values.length > 0 ? values : undefined;
    }

    private parseStartBeforeValue(raw: unknown): number | undefined {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
            const value = Math.trunc(raw);
            return value >= 0 ? value : undefined;
        }
        if (typeof raw !== 'string') return undefined;

        const normalized = normalizeAsciiDigits(raw)
            .replace(/\u3000/g, ' ')
            .trim()
            .toLowerCase();
        if (!normalized) return undefined;

        const match = normalized.match(/^(\d+)(?:\s*days?)?$/) ?? normalized.match(/^(\d+)\s*日$/);
        if (!match) return undefined;

        const value = Number(match[1]);
        if (!Number.isInteger(value) || value < 0) return undefined;
        return value;
    }

    private calculateNextDueForDueAnchor(
        frequency: Frequency,
        nextDue: string | undefined,
        completionDate: Date
    ): string | null {
        const completionDay = this.normalizeToDateOnly(completionDate);
        const completionDayStr = toDateString(completionDay);

        // No existing due-date baseline yet -> fall back to completion-day based first generation.
        if (!nextDue) {
            return calculateNextDue(frequency, completionDay);
        }

        // Catch up the existing due-based phase until it becomes strictly future
        // (a due date already in the future is returned unchanged by the first check).
        return advanceDueUntil(frequency, nextDue, completionDayStr, false);
    }

    /**
     * Due date to reason about on a given date: the frontmatter value when present, otherwise the
     * derived first occurrence (spec: §3.x). Display, `@done` gating and lead-window checks must all
     * use this so a routine without `next_due` behaves the same as one with it. Never written back.
     */
    resolveDueForDate(note: RoutineNote, targetDate: Date): string | undefined {
        return note.next_due ?? resolveInitialDue(note.frequency, this.normalizeToDateOnly(targetDate)) ?? undefined;
    }

    private shouldAdvanceFromCurrentDue(
        note: RoutineNote,
        completionDate: Date,
        mode: RoutineCompletionMode
    ): boolean {
        if (mode !== 'advanceFromDue') return false;

        const due = this.resolveDueForDate(note, completionDate);
        if (!due) return false;

        const leadDays = note.start_before ?? 0;
        if (leadDays <= 0) return false;

        const completionDay = toDateString(this.normalizeToDateOnly(completionDate));
        const visibleFrom = toDateString(addDays(fromDateString(due), -leadDays));
        return completionDay >= visibleFrom && completionDay <= due;
    }

    /**
     * Extract all Obsidian wikilink texts from a task line.
     * e.g. "- [x] [[朝のルーチン]]と[[運動]]" → ["朝のルーチン", "運動"]
     */
    extractLinkTexts(lineText: string): string[] {
        const matches = lineText.matchAll(/\[\[([^\]|#]+?)(?:[|#][^\]]*?)?\]\]/g);
        return Array.from(matches).map(match => match[1].trim());
    }

    /**
     * Resolve a wikilink name to a TFile inside the routine folder's ROOT only.
     * Uses Obsidian's metadataCache for proper vault-aware resolution.
     */
    resolveRoutineFile(linkText: string, sourcePath: string): TFile | null {
        const file = this.app.metadataCache.getFirstLinkpathDest(linkText, sourcePath);
        if (!file) return null;

        if (!this.isInManagedFolder(file)) return null;

        return file;
    }

    /**
     * Read routine metadata from a TFile's YAML frontmatter.
     */
    readRoutineNote(file: TFile): RoutineNote | null {
        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter || {};

        const repeatExplicit = fm.repeat !== undefined && fm.repeat !== null ||
            fm.frequency !== undefined && fm.frequency !== null ||
            fm.schedule !== undefined && fm.schedule !== null;
        const frequency = this.resolveFrequency(fm.repeat, fm.frequency, fm.schedule);
        return {
            file,
            estimate: typeof fm.estimate === 'number' ? fm.estimate : undefined,
            start: this.parseStartValue(fm.start),
            start_before: this.parseStartBeforeValue(fm.start_before),
            section: this.parseSectionValue(fm.section),
            frequency,
            next_due: typeof fm.next_due === 'string' ? fm.next_due : undefined,
            rollover: this.resolveRollover(fm.rollover),
            repeatExplicit,
        };
    }

    private resolveRollover(rawRollover: unknown): boolean | undefined {
        if (typeof rawRollover === 'boolean') return rawRollover;
        return undefined;
    }

    private resolveFrequency(rawRepeat: unknown, rawFrequency: unknown, rawSchedule: unknown): Frequency {
        if (typeof rawRepeat === 'number' || typeof rawRepeat === 'string') {
            const normalized = normalizeRepeatExpression(rawRepeat);
            if (normalized === 'none' || normalized === 'no') {
                return { type: 'none' };
            }
            return { type: 'schedule', expression: normalized };
        }
        if (typeof rawSchedule === 'string' && rawSchedule.trim().length > 0) {
            // Legacy `schedule` must fold the stop values the same way `repeat` does,
            // otherwise a stopped routine falls through to the "show it" side.
            const normalized = rawSchedule.trim().toLowerCase();
            if (normalized === 'none' || normalized === 'no') {
                return { type: 'none' };
            }
            return { type: 'schedule', expression: rawSchedule };
        }
        if (rawFrequency !== undefined && rawFrequency !== null) {
            return rawFrequency as Frequency;
        }
        return { type: 'schedule', expression: 'every day' };
    }

    private defaultRollover(frequency: Frequency): boolean {
        switch (frequency.type) {
            case 'none':
                return true;
            case 'after':
            case 'every':
                return true;
            case 'schedule':
                // completion-anchored: show every day until done (like legacy 'after'/'every')
                // due-anchored or neither: catch up to next scheduled occurrence
                return usesCompletionAnchor(frequency);
            case 'daily':
            case 'weekly':
            case 'monthly':
            case 'nth_day':
            case 'yearly':
                return false;
        }
    }

    private isRolloverEnabled(note: RoutineNote): boolean {
        return note.rollover ?? this.defaultRollover(note.frequency);
    }

    /**
     * Single source of truth for "is this routine due on the target date?" (spec: §3.6).
     *
     * `displayDue` is the date the display logic compares against the target date;
     * `nextDue` is the due date the caller should surface for the note (unchanged unless a
     * disabled-rollover catch-up moved it). A null `displayDue` means "do not show".
     * Nothing here writes to the note: a missing `next_due` is derived on every read.
     */
    private resolveEffectiveDue(note: RoutineNote, targetDate: Date): { displayDue: string | null; nextDue?: string } {
        const targetStr = toDateString(targetDate);
        const base = note.next_due ?? resolveInitialDue(note.frequency, targetDate) ?? undefined;

        if (!base) return { displayDue: null };
        if (base >= targetStr) return { displayDue: base, nextDue: base };

        // Overdue from here on.
        if (this.isRolloverEnabled(note)) {
            // Keep the missed occurrence: show it today without moving next_due.
            return { displayDue: targetStr, nextDue: base };
        }

        const advanced = advanceDueUntil(note.frequency, base, targetStr, true);
        if (advanced === null) return { displayDue: null, nextDue: base };

        if (advanced !== note.next_due) {
            this.emitDebugEvent('fetchDueRoutines:preview-catchup-next-due', {
                file: note.file.path,
                from: note.next_due ?? null,
                to: advanced,
                targetDate: targetStr,
            });
        }

        return { displayDue: advanced, nextDue: advanced };
    }

    private shouldDisplayOnTargetDate(note: RoutineNote, targetDate: Date, displayDue: string | null): boolean {
        if (!displayDue) return false;

        const targetStr = toDateString(targetDate);
        if (displayDue < targetStr) return false;

        const leadDays = note.start_before ?? 0;
        if (leadDays <= 0) {
            return displayDue === targetStr;
        }

        const visibleFrom = toDateString(addDays(fromDateString(displayDue), -leadDays));
        return targetStr >= visibleFrom && targetStr <= displayDue;
    }

    /**
     * Updates the next_due field in the routine note's YAML frontmatter.
     * Includes a pre-check to repair malformed frontmatter (e.g. unclosed or indented).
     * @param options - Can include nextDue (string or null to delete) and optional repeat.
     */
    async updateNextDue(file: TFile, options: { nextDue: string | null; repeat?: string | number }): Promise<void> {
        this.emitDebugEvent('updateNextDue:start', {
            file: file.path,
            nextDue: options.nextDue,
            repeat: options.repeat ?? null,
        });
        const cache = this.app.metadataCache.getFileCache(file);

        // Pre-check for malformed frontmatter if Obsidian doesn't recognize it
        if (!cache?.frontmatter) {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            const firstLine = lines[0] || '';
            const trimmedFirst = firstLine.trim();

            if (trimmedFirst === '---') {
                // Potential malformed frontmatter (indented or unclosed)
                let repairNeeded = false;

                // Case 1: Indented "---" at the very start
                if (firstLine.startsWith(' ') && firstLine.trim() === '---') {
                    lines[0] = '---';
                    repairNeeded = true;
                }

                // Case 2: Unclosed "---" block
                const secondDashIndex = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
                if (secondDashIndex === -1) {
                    // Try to find a reasonable place to close it (before first heading or empty line after properties)
                    let lastPropertyLine = 0;
                    for (let i = 1; i < lines.length; i++) {
                        if (lines[i].includes(':')) lastPropertyLine = i;
                        else if (lines[i].trim() !== '' && !lines[i].startsWith('#')) break;
                        else if (lines[i].trim() === '') break;
                    }
                    lines.splice(lastPropertyLine + 1, 0, '---');
                    repairNeeded = true;
                }

                if (repairNeeded) {
                    this.emitDebugEvent('updateNextDue:repair-frontmatter', { file: file.path });
                    console.debug(`[LLR] Repairing malformed frontmatter for ${file.path}`);
                    await this.app.vault.modify(file, lines.join('\n'));
                    this.emitNotice('LLR: YAMLを修復しました', 3000);
                }
            }
        }

        await this.app.fileManager.processFrontMatter(file, (fm) => {
            if (options.nextDue === null) {
                delete fm.next_due;
            } else {
                fm.next_due = options.nextDue;
            }

            if (options.repeat !== undefined) {
                fm.repeat = options.repeat;
            }
        });
        this.emitDebugEvent('updateNextDue:done', {
            file: file.path,
            nextDue: options.nextDue,
        });
    }

    /**
     * Core logic: given a routine note, calculate and write the new next_due.
     * @param routineNote - The resolved routine note
     * @param completionDate - The date the task was marked complete (for 'after' type)
     */
    async processCompletion(
        routineNote: RoutineNote,
        completionDate: Date,
        options: { mode?: RoutineCompletionMode } = {}
    ): Promise<void> {
        const { file, next_due } = routineNote;
        let { frequency } = routineNote;
        const requestedMode = options.mode ?? 'normal';
        this.emitDebugEvent('processCompletion:start', {
            file: file.path,
            completionAt: completionDate.toISOString(),
            hasFrequency: !!frequency,
            next_due: next_due ?? null,
            mode: requestedMode,
        });

        try {
            const completionDay = this.normalizeToDateOnly(completionDate);

            if (this.isSrsFile(file)) {
                const { nextDue, grownRepeat } = this.computeSrsCompletion(routineNote, completionDay);
                await this.updateNextDue(file, { nextDue, repeat: grownRepeat });
                this.emitDebugEvent('processCompletion:done', {
                    file: file.path,
                    newNextDue: nextDue,
                    baseDate: toDateString(completionDay),
                    anchorMode: 'srs',
                    grownRepeat,
                });
                return;
            }

            // If repeat was not explicit in frontmatter (repeatExplicit === false), write repeat: 1 to make the default permanent.
            const repeatToAppend: number | undefined = routineNote.repeatExplicit === false ? 1 : undefined;

            // frequency is always set via readRoutineNote, but guard here for safety.
            if (!frequency) frequency = { type: 'schedule', expression: 'every day' };

            const isDueAnchored = usesDueAnchor(frequency);
            const shouldAdvanceFromDue = this.shouldAdvanceFromCurrentDue(routineNote, completionDay, requestedMode);
            // `@done` closes the occurrence the user can currently see, which may be a derived one.
            const effectiveDue = next_due ?? resolveInitialDue(frequency, completionDay) ?? undefined;
            const newNextDue = shouldAdvanceFromDue && effectiveDue
                ? calculateNextDue(frequency, fromDateString(effectiveDue))
                : isDueAnchored
                    ? this.calculateNextDueForDueAnchor(frequency, next_due, completionDay)
                    : calculateNextDue(frequency, completionDay);

            await this.updateNextDue(file, { nextDue: newNextDue, repeat: repeatToAppend });
            this.emitDebugEvent('processCompletion:done', {
                file: file.path,
                newNextDue,
                baseDate: toDateString(completionDay),
                anchorMode: shouldAdvanceFromDue ? 'atdone' : isDueAnchored ? 'due' : 'completion',
            });
        } catch (e) {
            console.error('[LLR] processCompletion error:', e);
            this.emitDebugEvent('processCompletion:fallback', {
                file: file.path,
                error: e instanceof Error ? e.message : String(e),
            });
            // Fallback: If calculation fails, set to tomorrow
            const tomorrow = new Date(completionDate);
            tomorrow.setDate(tomorrow.getDate() + 1);
            await this.updateNextDue(file, { nextDue: toDateString(tomorrow) });
            this.emitNotice('LLR: 設定不備で翌日に設定しました', 5000);
        }
    }

    /**
     * Schedule or cancel a debounced routine update for a specific file.
     * Use file path as key for stable debouncing across any state change.
     */
    scheduleUpdate(routineFile: TFile, sourcePath: string, request: RoutineCompletionRequest | null): void {
        const key = `${sourcePath}:${routineFile.path}`;

        // 1. Cancel any existing pending update for this specific file
        const existing = this.pendingTimers.get(key);
        if (existing) {
            clearTimeout(existing.timer);
            this.pendingTimers.delete(key);
            this.emitDebugEvent('scheduleUpdate:cancel-existing', {
                key,
                routineFile: routineFile.path,
                sourcePath,
            });
        }

        // 2. If task was marked complete, schedule renewal
        if (request) {
            const scheduledAt = new Date();
            const executeAt = new Date(scheduledAt.getTime() + DEBOUNCE_DELAY_MS);
            this.emitDebugEvent('scheduleUpdate:scheduled', {
                key,
                routineFile: routineFile.path,
                sourcePath,
                completionAt: request.completionDate.toISOString(),
                scheduledAt: scheduledAt.toISOString(),
                executeAt: executeAt.toISOString(),
                delayMs: DEBOUNCE_DELAY_MS,
                mode: request.mode ?? 'normal',
            });
            const timer = setTimeout(() => {
                void (async () => {
                    console.debug(`[LLR] Executing routine update for: ${routineFile.basename}`);
                    this.pendingTimers.delete(key);
                    this.emitDebugEvent('scheduleUpdate:timer-fired', {
                        key,
                        routineFile: routineFile.path,
                        sourcePath,
                        firedAt: new Date().toISOString(),
                    });
                    const routineNote = this.readRoutineNote(routineFile);
                    if (routineNote) {
                        await this.processCompletion(routineNote, request.completionDate, { mode: request.mode });
                    } else {
                        this.emitDebugEvent('scheduleUpdate:missing-routine-note', {
                            key,
                            routineFile: routineFile.path,
                        });
                    }
                })();
            }, DEBOUNCE_DELAY_MS);

            this.pendingTimers.set(key, { timer, request });
        } else {
            this.emitDebugEvent('scheduleUpdate:not-scheduled', {
                key,
                routineFile: routineFile.path,
                sourcePath,
                reason: 'completion reverted or unchecked',
            });
        }
    }

    /**
     * Flush all pending timers immediately (call this from plugin onunload).
     * Ensures no updates are lost when Obsidian is closed.
     */
    async flushAll(): Promise<void> {
        this.emitDebugEvent('flushAll:start', { pendingCount: this.pendingTimers.size });
        for (const [key, pending] of this.pendingTimers.entries()) {
            clearTimeout(pending.timer);
            this.pendingTimers.delete(key);

            // parse key: sourcePath:routinePath
            const colonIdx = key.indexOf(':');
            if (colonIdx === -1) continue;

            const routinePath = key.substring(colonIdx + 1);
            const file = this.app.vault.getAbstractFileByPath(routinePath);

            if (file instanceof TFile) {
                const routineNote = this.readRoutineNote(file);
                if (routineNote) {
                    this.emitDebugEvent('flushAll:process-pending', {
                        key,
                        routineFile: file.path,
                    });
                    await this.processCompletion(routineNote, pending.request.completionDate, {
                        mode: pending.request.mode,
                    });
                }
            }
        }
        this.emitDebugEvent('flushAll:done');
    }

    private computeSrsCompletion(routineNote: RoutineNote, completionDay: Date): { nextDue: string; grownRepeat: number } {
        const currentRepeat = this.extractRepeatAsNumber(routineNote);
        const effectiveRepeat = Math.max(currentRepeat, 1);

        const nextDue = toDateString(addDays(completionDay, effectiveRepeat));

        let growthBase = effectiveRepeat;
        if (routineNote.next_due) {
            const dueDate = fromDateString(routineNote.next_due);
            const elapsed = Math.floor((completionDay.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            if (elapsed > growthBase) {
                growthBase = elapsed;
            }
        }

        const growthRate = SRS_GROWTH_MIN + Math.random() * (SRS_GROWTH_MAX - SRS_GROWTH_MIN);
        const grownRepeat = Math.round(growthBase * growthRate);

        return { nextDue, grownRepeat };
    }

    private extractRepeatAsNumber(routineNote: RoutineNote): number {
        if (!routineNote.repeatExplicit) return 1;
        if (routineNote.frequency.type !== 'schedule') return 1;
        const expr = routineNote.frequency.expression;
        if (!expr) return 1;
        if (expr === 'every day') return 1;
        const match = expr.match(/^every\s+(\d+)\s+days?$/);
        if (match) return Number(match[1]);
        return 1;
    }

    /**
     * Fetch all routine notes whose normalized next_due lands on the target day.
     * Used by the Insert Routine command.
     */
    fetchDueRoutines(today: Date): RoutineNote[] {
        const results: RoutineNote[] = [];

        this.collectDueFromFolder(this.routineFolder, today, results);
        if (this.srsGrowthEnabled) {
            this.collectDueFromVault(today, results);
        }

        return results;
    }

    private collectDueFromFolder(folderPath: string, today: Date, results: RoutineNote[]): void {
        const folder = this.app.vault.getFolderByPath(folderPath);
        if (!folder) return;

        for (const child of folder.children) {
            if (!(child instanceof TFile)) continue;
            if (child.extension !== 'md') continue;

            const note = this.readRoutineNote(child);
            if (!note) continue;

            let displayDue: string | null;
            let nextDue: string | undefined;
            try {
                ({ displayDue, nextDue } = this.resolveEffectiveDue(note, today));
            } catch (e) {
                // One broken note must not empty the whole insert. Show it so the breakage
                // is visible instead of silently dropping it (same stance as resolveInitialDue).
                this.emitDebugEvent('fetchDueRoutines:resolve-failed', {
                    file: note.file.path,
                    error: e instanceof Error ? e.message : String(e),
                });
                displayDue = toDateString(today);
                nextDue = note.next_due;
            }
            if (!displayDue) continue;

            const resolvedNote = nextDue === note.next_due ? note : { ...note, next_due: nextDue };

            if (this.shouldDisplayOnTargetDate(resolvedNote, today, displayDue)) {
                results.push(resolvedNote);
            }
        }
    }

    private collectDueFromVault(today: Date, results: RoutineNote[]): void {
        const routineFiles = new Set(results.map(r => r.file.path));
        const allFiles = this.app.vault.getMarkdownFiles();

        for (const file of allFiles) {
            if (routineFiles.has(file.path)) continue;
            if (this.isRoutineFile(file)) continue;
            if (!this.isSrsFile(file)) continue;

            const note = this.readRoutineNote(file);
            if (!note) continue;

            const todayStr = toDateString(today);
            if (!note.next_due || note.next_due <= todayStr) {
                note.isSrs = true;
                results.push(note);
            }
        }
    }
}
