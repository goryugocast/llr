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
import { calculateNextDue, fromDateString, normalizeRepeatExpression, toDateString, type Frequency, usesDueAnchor } from './yaml-parser';
import { parseCutoffMinutes } from './day-cutoff';

const DEFAULT_ROUTINE_FOLDER = 'routine';
const DEBOUNCE_DELAY_MS = 0; // Debug phase: immediate update (may revert to delayed)

export interface RoutineEngineDebugEvent {
    source: 'routine-engine';
    message: string;
    data?: unknown;
}

interface RoutineEngineOptions {
    onDebugEvent?: (event: RoutineEngineDebugEvent) => void;
    onNotice?: (message: string, timeout?: number) => void;
    routineFolder?: string;
}

export interface RoutineNote {
    file: TFile;
    estimate?: number;      // 省略可。展開時に (Xm) として付与
    start?: number;        // 省略可。HHmm 形式。展開時に単一時刻プレフィクスとして付与
    start_before?: number; // 省略可。next_due の何日前から表示するか（日数）
    section?: number;      // 省略可。展開時のソート基準（時間帯の概念）。未設定は先頭
    frequency?: Frequency;
    next_due?: string;
    rollover?: boolean;
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
    private pendingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private onDebugEvent?: (event: RoutineEngineDebugEvent) => void;
    private onNotice?: (message: string, timeout?: number) => void;

    constructor(app: App, options: RoutineEngineOptions = {}) {
        this.app = app;
        this.onDebugEvent = options.onDebugEvent;
        this.onNotice = options.onNotice;
        this.routineFolder = this.normalizeRoutineFolder(options.routineFolder);
    }

    private normalizeRoutineFolder(value: unknown): string {
        const raw = typeof value === 'string' ? value.trim() : '';
        const stripped = raw.replace(/^\/+/, '').replace(/\/+$/, '');
        return stripped || DEFAULT_ROUTINE_FOLDER;
    }

    setRoutineFolder(folder: string): void {
        this.routineFolder = this.normalizeRoutineFolder(folder);
        this.emitDebugEvent('routine-folder:updated', { routineFolder: this.routineFolder });
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

    private addDays(date: Date, days: number): Date {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    private normalizeAsciiDigits(text: string): string {
        return text.replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xFF10));
    }

    private parseStartValue(raw: unknown): number | undefined {
        if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
        const value = Math.trunc(raw);
        const hh = Math.floor(value / 100);
        const mm = value % 100;
        if (hh < 0 || hh > 29 || mm < 0 || mm > 59) return undefined;
        return value;
    }

    private parseStartBeforeValue(raw: unknown): number | undefined {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
            const value = Math.trunc(raw);
            return value >= 0 ? value : undefined;
        }
        if (typeof raw !== 'string') return undefined;

        const normalized = this.normalizeAsciiDigits(raw)
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

    private isDateStringAfter(dateStr: string, baseDate: Date): boolean {
        return dateStr > toDateString(this.normalizeToDateOnly(baseDate));
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

        // If the due date is already in the future, keep it (do not push farther).
        if (nextDue > completionDayStr) {
            return nextDue;
        }

        // Catch up within the existing due-based phase until it becomes strictly future.
        let candidate = nextDue;
        for (let i = 0; i < 1000; i++) {
            if (candidate > completionDayStr) return candidate;
            const next = calculateNextDue(frequency, fromDateString(candidate));
            if (next === null) return null;
            if (next === candidate) {
                throw new Error(`Due-anchor catch-up did not advance: ${candidate}`);
            }
            candidate = next;
        }

        throw new Error('Due-anchor catch-up exceeded iteration limit');
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

        // Path must start with routineFolder + "/" (case-insensitive) and NOT contain any subsequent "/"
        const lowerPath = file.path.toLowerCase();
        const lowerFolder = this.routineFolder.toLowerCase() + '/';

        if (!lowerPath.startsWith(lowerFolder)) return null;

        const pathAfterFolder = file.path.substring(this.routineFolder.length + 1);
        if (pathAfterFolder.includes('/')) return null;

        return file;
    }

    /**
     * Read routine metadata from a TFile's YAML frontmatter.
     */
    async readRoutineNote(file: TFile): Promise<RoutineNote | null> {
        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter || {};

        const frequency = this.resolveFrequency(fm.repeat, fm.frequency, fm.schedule);
        return {
            file,
            estimate: typeof fm.estimate === 'number' ? fm.estimate : undefined,
            start: this.parseStartValue(fm.start),
            start_before: this.parseStartBeforeValue(fm.start_before),
            section: typeof fm.section === 'number' ? fm.section : undefined,
            frequency,
            next_due: typeof fm.next_due === 'string' ? fm.next_due : undefined,
            rollover: this.resolveRollover(fm.rollover),
        };
    }

    private resolveRollover(rawRollover: unknown): boolean | undefined {
        if (typeof rawRollover === 'boolean') return rawRollover;
        return undefined;
    }

    private resolveFrequency(rawRepeat: unknown, rawFrequency: unknown, rawSchedule: unknown): Frequency | undefined {
        if (typeof rawRepeat === 'number' || typeof rawRepeat === 'string') {
            const normalized = normalizeRepeatExpression(rawRepeat);
            if (normalized === 'none' || normalized === 'no') {
                return { type: 'none' };
            }
            return { type: 'schedule', expression: normalized };
        }
        if (typeof rawSchedule === 'string' && rawSchedule.trim().length > 0) {
            return { type: 'schedule', expression: rawSchedule };
        }
        return rawFrequency as Frequency | undefined;
    }

    private defaultRollover(frequency: Frequency): boolean {
        switch (frequency.type) {
            case 'none':
                return true;
            case 'after':
            case 'every':
                return true;
            case 'schedule':
                return !usesDueAnchor(frequency);
            case 'daily':
            case 'weekly':
            case 'monthly':
            case 'nth_day':
            case 'yearly':
                return false;
        }
    }

    private isRolloverEnabled(note: RoutineNote): boolean {
        if (note.frequency) {
            return note.rollover ?? this.defaultRollover(note.frequency);
        }
        return note.rollover ?? true;
    }

    private resolveDisplayDueDate(note: RoutineNote, targetDate: Date): string | null {
        if (!note.frequency) return null;
        const targetStr = toDateString(targetDate);

        if (!note.next_due) {
            return note.frequency.type === 'none' ? null : targetStr;
        }

        if (note.next_due >= targetStr) return note.next_due;

        if (this.isRolloverEnabled(note)) {
            return targetStr;
        }

        let candidate = note.next_due;
        for (let i = 0; i < 1000; i++) {
            if (candidate >= targetStr) return candidate;
            const next = calculateNextDue(note.frequency, fromDateString(candidate));
            if (next === null) return null;
            if (next === candidate) {
                throw new Error(`Rollover catch-up did not advance: ${candidate}`);
            }
            candidate = next;
        }

        throw new Error('Rollover catch-up exceeded iteration limit');
    }

    private shouldDisplayOnTargetDate(note: RoutineNote, targetDate: Date, displayDue: string | null): boolean {
        if (!displayDue) return false;

        const targetStr = toDateString(targetDate);
        if (displayDue < targetStr) return false;

        const leadDays = note.start_before ?? 0;
        if (leadDays <= 0) {
            return displayDue === targetStr;
        }

        const visibleFrom = toDateString(this.addDays(fromDateString(displayDue), -leadDays));
        return targetStr >= visibleFrom && targetStr <= displayDue;
    }

    private async normalizeOverdueNextDue(note: RoutineNote, targetDate: Date): Promise<RoutineNote> {
        if (!note.frequency) return note;
        if (!note.next_due) return note;
        if (note.frequency.type === 'none') return note;
        if (note.rollover === true) return note;

        const targetStr = toDateString(targetDate);
        if (note.next_due >= targetStr) return note;

        let candidate = note.next_due;
        for (let i = 0; i < 1000; i++) {
            if (candidate >= targetStr) break;
            const next = calculateNextDue(note.frequency, fromDateString(candidate));
            if (next === null) return note;
            if (next === candidate) {
                throw new Error(`Overdue catch-up did not advance: ${candidate}`);
            }
            candidate = next;
        }

        if (candidate !== note.next_due) {
            await this.updateNextDue(note.file, { nextDue: candidate });
            this.emitDebugEvent('fetchDueRoutines:catchup-next-due', {
                file: note.file.path,
                from: note.next_due,
                to: candidate,
                targetDate: targetStr,
            });
            return {
                ...note,
                next_due: candidate,
            };
        }

        return note;
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
                let newContent = content;

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
                    console.log(`[LLR] Repairing malformed frontmatter for ${file.path}`);
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
    async processCompletion(routineNote: RoutineNote, completionDate: Date): Promise<void> {
        const { file, next_due } = routineNote;
        let { frequency } = routineNote;
        this.emitDebugEvent('processCompletion:start', {
            file: file.path,
            completionAt: completionDate.toISOString(),
            hasFrequency: !!frequency,
            next_due: next_due ?? null,
        });

        try {
            // Default completion logic: if no frequency is defined, it's an "auto-repair" case
            let repeatToAppend: number | undefined = undefined;
            if (!frequency) {
                frequency = { type: 'schedule', expression: 'every day' };
                repeatToAppend = 1;
                this.emitNotice('LLR: 毎日リピートを設定しました', 3000);
            }

            const completionDay = this.normalizeToDateOnly(completionDate);
            const isDueAnchored = usesDueAnchor(frequency);
            const newNextDue = isDueAnchored
                ? this.calculateNextDueForDueAnchor(frequency, next_due, completionDay)
                : calculateNextDue(frequency, completionDay);

            await this.updateNextDue(file, { nextDue: newNextDue, repeat: repeatToAppend });
            this.emitDebugEvent('processCompletion:done', {
                file: file.path,
                newNextDue,
                baseDate: toDateString(completionDay),
                anchorMode: isDueAnchored ? 'due' : 'completion',
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
    scheduleUpdate(routineFile: TFile, sourcePath: string, completionDate: Date | null): void {
        const key = `${sourcePath}:${routineFile.path}`;

        // 1. Cancel any existing pending update for this specific file
        const existing = this.pendingTimers.get(key);
        if (existing) {
            clearTimeout(existing);
            this.pendingTimers.delete(key);
            this.emitDebugEvent('scheduleUpdate:cancel-existing', {
                key,
                routineFile: routineFile.path,
                sourcePath,
            });
        }

        // 2. If task was marked complete, schedule renewal
        if (completionDate) {
            const scheduledAt = new Date();
            const executeAt = new Date(scheduledAt.getTime() + DEBOUNCE_DELAY_MS);
            this.emitDebugEvent('scheduleUpdate:scheduled', {
                key,
                routineFile: routineFile.path,
                sourcePath,
                completionAt: completionDate.toISOString(),
                scheduledAt: scheduledAt.toISOString(),
                executeAt: executeAt.toISOString(),
                delayMs: DEBOUNCE_DELAY_MS,
            });
            const timer = setTimeout(async () => {
                console.log(`[LLR] Executing routine update for: ${routineFile.basename}`);
                this.pendingTimers.delete(key);
                this.emitDebugEvent('scheduleUpdate:timer-fired', {
                    key,
                    routineFile: routineFile.path,
                    sourcePath,
                    firedAt: new Date().toISOString(),
                });
                const routineNote = await this.readRoutineNote(routineFile);
                if (routineNote) {
                    await this.processCompletion(routineNote, completionDate);
                } else {
                    this.emitDebugEvent('scheduleUpdate:missing-routine-note', {
                        key,
                        routineFile: routineFile.path,
                    });
                }
            }, DEBOUNCE_DELAY_MS);

            this.pendingTimers.set(key, timer);
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
        for (const [key, timer] of this.pendingTimers.entries()) {
            clearTimeout(timer);
            this.pendingTimers.delete(key);

            // parse key: sourcePath:routinePath
            const colonIdx = key.indexOf(':');
            if (colonIdx === -1) continue;

            const routinePath = key.substring(colonIdx + 1);
            const file = this.app.vault.getAbstractFileByPath(routinePath);

            if (file instanceof TFile) {
                const routineNote = await this.readRoutineNote(file);
                if (routineNote) {
                    this.emitDebugEvent('flushAll:process-pending', {
                        key,
                        routineFile: file.path,
                    });
                    // During flushAll, we don't know the exact completion date easily, 
                    // so we use NOW, which is safe for most cases.
                    await this.processCompletion(routineNote, new Date());
                }
            }
        }
        this.emitDebugEvent('flushAll:done');
    }

    /**
     * Fetch all routine notes whose normalized next_due lands on the target day.
     * Used by the Insert Routine command.
     */
    async fetchDueRoutines(today: Date): Promise<RoutineNote[]> {
        const folder = this.app.vault.getFolderByPath(this.routineFolder);
        if (!folder) return [];

        const results: RoutineNote[] = [];

        for (const child of folder.children) {
            if (!(child instanceof TFile)) continue;
            if (child.extension !== 'md') continue;

            const note = await this.readRoutineNote(child);
            if (!note || !note.frequency) continue; // Must have a frequency to be a recurring routine
            if (!note.next_due) continue;

            const normalizedNote = await this.normalizeOverdueNextDue(note, today);

            const displayDue = this.resolveDisplayDueDate(normalizedNote, today);

            if (this.shouldDisplayOnTargetDate(normalizedNote, today, displayDue)) {
                results.push(normalizedNote);
            }
        }

        return results;
    }
}
