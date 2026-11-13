import { App } from 'obsidian';

export type TimelinePlatform = 'ios' | 'android' | 'desktop';
export type TimelineDirection = 'past' | 'next';
export type TimelineDiagnosticName =
    | 'input' | 'scroll' | 'extend-request' | 'extend-start' | 'extend-ready' | 'prepend-before' | 'prepend-after'
    | 'trim' | 'anchor-capture' | 'anchor-restore-before' | 'anchor-restore-after' | 'extend-end' | 'date-sync'
    | 'viewport' | 'snapshot' | 'open' | 'close' | 'jump-start' | 'jump-end' | 'refresh-start' | 'refresh-end';
export type TimelineInputKind = 'pointerdown' | 'touchstart' | 'touchmove' | 'touchend' | 'wheel' | 'key';
export type TimelineAnchorKind = 'day' | 'block' | 'time' | 'record';
export type TimelineOutcome = 'ok' | 'failed' | 'guarded' | 'no-candidates' | 'missing-anchor' | 'element' | 'day-fallback' | 'top-fallback' | 'unavailable';

export interface TimelineDiagnosticEvent {
    event: TimelineDiagnosticName;
    viewId?: number | null;
    date?: string | null;
    firstDate?: string | null;
    lastDate?: string | null;
    pendingDate?: string | null;
    removedFirstDate?: string | null;
    removedLastDate?: string | null;
    direction?: TimelineDirection | null;
    top?: number | null;
    scrollHeight?: number | null;
    viewportHeight?: number | null;
    deltaY?: number | null;
    anchorOffset?: number | null;
    anchorTop?: number | null;
    anchorDayOffset?: number | null;
    visibleCount?: number | null;
    inputRevision?: number | null;
    anchorId?: number | null;
    removedCount?: number | null;
    suppressedCount?: number | null;
    anchorDay?: string | null;
    anchorKind?: TimelineAnchorKind | null;
    inputKind?: TimelineInputKind | null;
    outcome?: TimelineOutcome | null;
}

export interface TimelineDiagnosticsOptions {
    buildId: string;
    baseVersion: string;
    platform: TimelinePlatform;
    onFailure?: () => void;
}

export interface TimelineDiagnosticsStopResult {
    path: string | null;
    reason: string;
    records: number;
    dropped: number;
}

type SafeEvent = Record<string, string | number | boolean | null | string[]>;
type SerializedEvent = {
    timestamp: string;
    sequence: number;
    buildId: string;
    baseVersion: string;
    platform: TimelinePlatform;
    event: string;
    [key: string]: unknown;
};

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_RECORDS = 5000;
const MAX_INPUT_INTERVAL_MS = 33;
const FLUSH_INTERVAL_MS = 1500;
const STOP_RESERVE_BYTES = 384;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const EVENTS: TimelineDiagnosticName[] = [
    'input', 'scroll', 'extend-request', 'extend-start', 'extend-ready', 'prepend-before', 'prepend-after',
    'trim', 'anchor-capture', 'anchor-restore-before', 'anchor-restore-after', 'extend-end', 'date-sync',
    'viewport', 'snapshot', 'open', 'close', 'jump-start', 'jump-end', 'refresh-start', 'refresh-end',
];
const INPUT_KINDS: TimelineInputKind[] = ['pointerdown', 'touchstart', 'touchmove', 'touchend', 'wheel', 'key'];
const THROTTLED_INPUTS: TimelineInputKind[] = ['touchmove', 'wheel'];
const ANCHOR_KINDS: TimelineAnchorKind[] = ['day', 'block', 'time', 'record'];
const OUTCOMES: TimelineOutcome[] = ['ok', 'failed', 'guarded', 'no-candidates', 'missing-anchor', 'element', 'day-fallback', 'top-fallback', 'unavailable'];

/**
 * Bounded, opt-in timeline diagnostics. Payloads are deliberately a closed union;
 * arbitrary strings, note content and paths cannot be passed through record().
 */
export class TimelineDiagnostics {
    private readonly dir = 'llrlog';
    private path: string | null = null;
    private stopped = false;
    private stopReason = 'stopped';
    private sequence = 0;
    private records = 0;
    private dropped = 0;
    private bufferedBytes = 0;
    private buffered: string[] = [];
    private writeQueue: Promise<void> = Promise.resolve();
    private flushTimer: ReturnType<typeof setInterval> | null = null;
    private inputTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingInput: SerializedEvent | null = null;
    private lastInputAt = 0;
    private failureReported = false;
    private startPromise: Promise<string | null> | null = null;
    private stopPromise: Promise<TimelineDiagnosticsStopResult> | null = null;
    private inputSuppressed = 0;

    constructor(private readonly app: App, private readonly options: TimelineDiagnosticsOptions) {}

    get active(): boolean { return this.activeState; }
    private activeState = false;

    get sessionId(): string | null { return this.path?.split('/').pop()?.replace(/^timeline-/, '').replace(/\.jsonl$/, '') ?? null; }

    async start(): Promise<string | null> {
        if (this.activeState) return this.path;
        if (this.startPromise) return this.startPromise;

        const startOperation = this.startAfterPreviousStop(this.stopPromise);
        this.startPromise = startOperation;
        try {
            return await startOperation;
        } finally {
            if (this.startPromise === startOperation) this.startPromise = null;
        }
    }

    /** Synchronous and cheap while disabled. Scroll, touchmove and wheel samples are coalesced at 33ms. */
    record(event: TimelineDiagnosticEvent): void {
        if (!this.activeState || this.stopped) return;
        const safe = this.toSafeEvent(event);
        if (!safe) {
            this.dropped += 1;
            return;
        }

        if (event.event === 'scroll' || (event.event === 'input' && event.inputKind && THROTTLED_INPUTS.includes(event.inputKind))) {
            this.recordInput(safe);
            return;
        }
        this.flushPendingInput();
        this.accept(safe);
    }

    async stop(reason = 'stopped'): Promise<TimelineDiagnosticsStopResult> {
        const pendingStart = this.startPromise;
        if (pendingStart) await pendingStart;
        if (this.stopPromise) return this.stopPromise;
        this.stopPromise = this.stopInternal(reason);
        return this.stopPromise;
    }

    /** Safe for Obsidian onunload: drains queued appends without surfacing rejection. */
    unload(): void {
        void this.stop('unload').catch((): void => undefined);
    }

    private async startInternal(): Promise<string | null> {
        const adapter = this.app.vault.adapter;
        const session = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        this.path = `${this.dir}/timeline-${session}.jsonl`;
        try {
            if (!(await adapter.exists(this.dir))) await adapter.mkdir(this.dir);
            const header = this.makeRecord('session-start', {
                phase: 'start',
                buildId: this.safeMeta(this.options.buildId),
                baseVersion: this.safeMeta(this.options.baseVersion),
                platform: this.options.platform,
            });
            const line = `${JSON.stringify(header)}\n`;
            await adapter.write(this.path, line);
            this.records = 1;
            this.bufferedBytes = new TextEncoder().encode(line).length;
            this.activeState = true;
            this.flushTimer = setInterval(() => { void this.flush(); }, FLUSH_INTERVAL_MS);
            return this.path;
        } catch {
            this.path = null;
            this.stopped = true;
            this.stopReason = 'io-error';
            this.reportFailure();
            return null;
        }
    }

    private async startAfterPreviousStop(previousStop: Promise<TimelineDiagnosticsStopResult> | null): Promise<string | null> {
        if (previousStop) await previousStop;
        await this.writeQueue;
        this.resetForNextSession();
        return this.startInternal();
    }

    private resetForNextSession(): void {
        this.clearTimers();
        this.activeState = false;
        this.stopped = false;
        this.stopReason = 'stopped';
        this.path = null;
        this.sequence = 0;
        this.records = 0;
        this.dropped = 0;
        this.bufferedBytes = 0;
        this.buffered = [];
        this.writeQueue = Promise.resolve();
        this.pendingInput = null;
        this.lastInputAt = 0;
        this.inputSuppressed = 0;
        this.failureReported = false;
        this.stopPromise = null;
    }

    private async stopInternal(reason: string): Promise<TimelineDiagnosticsStopResult> {
        if (this.startPromise) await this.startPromise;
        if (this.stopped && !this.activeState) {
            await this.writeQueue;
            return { path: this.path, reason: this.stopReason, records: this.records, dropped: this.dropped };
        }
        this.flushPendingInput();
        this.stopped = true;
        this.activeState = false;
        this.stopReason = this.safeReason(reason);
        this.clearTimers();
        if (this.path) {
            this.enqueueLine(this.makeRecord('session-stop', { phase: 'stop', reason: this.stopReason, dropped: this.dropped, terminalSequence: this.sequence + 1 }));
            await this.flush();
        }
        return { path: this.path, reason: this.stopReason, records: this.records, dropped: this.dropped };
    }

    private recordInput(safe: SafeEvent): void {
        const now = Date.now();
        const inputType = safe.inputKind;
        if (
            this.pendingInput &&
            now - this.lastInputAt < MAX_INPUT_INTERVAL_MS &&
            this.pendingInput.event === safe.event &&
            this.pendingInput.viewId === safe.viewId &&
            this.pendingInput.inputKind === inputType
        ) {
            this.inputSuppressed += 1;
            Object.assign(this.pendingInput, safe, { suppressedCount: this.inputSuppressed, timestamp: new Date().toISOString() });
            this.lastInputAt = now;
            return;
        }
        this.flushPendingInput();
        this.inputSuppressed = 0;
        this.pendingInput = this.makeRecord(String(safe.event), { ...safe, suppressedCount: 0 });
        this.lastInputAt = now;
        this.inputTimer = setTimeout(() => this.flushPendingInput(), MAX_INPUT_INTERVAL_MS);
    }

    private flushPendingInput(): void {
        if (!this.pendingInput) return;
        if (this.inputTimer) clearTimeout(this.inputTimer);
        this.inputTimer = null;
        const event = this.pendingInput;
        this.pendingInput = null;
        this.acceptRecord(event);
    }

    private accept(event: SafeEvent): void {
        this.acceptRecord(this.makeRecord(String(event.event), event));
    }

    private acceptRecord(record: SerializedEvent): void {
        if (!this.activeState || this.stopped) return;
        const line = `${JSON.stringify(record)}\n`;
        const bytes = new TextEncoder().encode(line).length;
        if (this.records >= MAX_RECORDS - 1 || this.bufferedBytes + bytes > MAX_BYTES - STOP_RESERVE_BYTES) {
            this.dropped += 1;
            this.autoStop(this.records >= MAX_RECORDS - 1 ? 'record-limit' : 'byte-limit');
            return;
        }
        this.records += 1;
        this.bufferedBytes += bytes;
        this.buffered.push(line);
    }

    private autoStop(reason: string): void {
        if (this.stopped) return;
        this.stopReason = reason;
        this.stopped = true;
        this.activeState = false;
        this.clearTimers();
        this.pendingInput = null;
        this.enqueueLine(this.makeRecord('auto-stop', { phase: 'stop', reason, dropped: this.dropped, terminalSequence: this.sequence + 1 }));
        void this.flush();
    }

    private enqueueLine(record: SerializedEvent): void {
        if (!this.path) return;
        const line = `${JSON.stringify(record)}\n`;
        const bytes = new TextEncoder().encode(line).length;
        this.records += 1;
        this.bufferedBytes += bytes;
        this.buffered.push(line);
    }

    private async flush(): Promise<void> {
        const path = this.path;
        if (!path || this.buffered.length === 0) {
            await this.writeQueue;
            return;
        }
        const lines = this.buffered.splice(0, this.buffered.length);
        this.writeQueue = this.writeQueue.then(async () => {
            try {
                await this.app.vault.adapter.append(path, lines.join(''));
            } catch {
                this.reportFailure();
                this.activeState = false;
                this.stopped = true;
                this.stopReason = 'io-error';
                this.clearTimers();
            }
        });
        await this.writeQueue;
    }

    private makeRecord(event: string, payload: SafeEvent): SerializedEvent {
        return {
            timestamp: new Date().toISOString(),
            sequence: ++this.sequence,
            buildId: this.safeMeta(this.options.buildId),
            baseVersion: this.safeMeta(this.options.baseVersion),
            platform: ['ios', 'android', 'desktop'].includes(this.options.platform) ? this.options.platform : 'desktop',
            event,
            ...payload,
        };
    }

    private toSafeEvent(event: TimelineDiagnosticEvent): SafeEvent | null {
        if (!event || typeof event !== 'object') return null;
        if (!EVENTS.includes(event.event)) return null;
        const safe: SafeEvent = { event: event.event };
        const numericKeys = ['top', 'scrollHeight', 'viewportHeight', 'deltaY', 'anchorOffset', 'anchorTop', 'anchorDayOffset'] as const;
        const integerKeys = ['viewId', 'visibleCount', 'inputRevision', 'anchorId', 'removedCount', 'suppressedCount'] as const;
        const dateKeys = ['date', 'firstDate', 'lastDate', 'pendingDate', 'removedFirstDate', 'removedLastDate', 'anchorDay'] as const;
        for (const key of numericKeys) {
            const value = event[key];
            if (value !== undefined) safe[key] = this.nullableFinite(value);
        }
        for (const key of integerKeys) {
            const value = event[key];
            if (value !== undefined) safe[key] = value === null ? null : this.nonNegativeInteger(value);
        }
        for (const key of dateKeys) {
            const value = event[key];
            if (value !== undefined) safe[key] = this.dayKeyOrNull(value);
        }
        if (event.direction !== undefined) safe.direction = event.direction === null || this.isDirection(event.direction) ? event.direction : null;
        if (event.inputKind !== undefined) safe.inputKind = event.inputKind === null || INPUT_KINDS.includes(event.inputKind) ? event.inputKind : null;
        if (event.anchorKind !== undefined) safe.anchorKind = event.anchorKind === null || ANCHOR_KINDS.includes(event.anchorKind) ? event.anchorKind : null;
        if (event.outcome !== undefined) safe.outcome = event.outcome === null || OUTCOMES.includes(event.outcome) ? event.outcome : null;
        return safe;
    }

    private finite(value: number): number {
        return Number.isFinite(value) ? value : 0;
    }

    private nullableFinite(value: number | null): number | null {
        return value === null ? null : this.finite(value);
    }

    private nonNegativeInteger(value: number): number {
        return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    }

    private isDayKey(value: string): boolean {
        if (!DAY_KEY.test(value)) return false;
        const parsed = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }

    private dayKeyOrNull(value: string | null): string | null {
        return value === null || this.isDayKey(value) ? value : null;
    }

    private isDirection(value: string): value is TimelineDirection {
        return value === 'past' || value === 'next';
    }

    private safeMeta(value: string): string {
        return /^[\w.+-]{1,64}$/.test(value) ? value : 'unknown';
    }

    private safeReason(reason: string): string {
        return /^[a-z-]{1,32}$/.test(reason) ? reason : 'stopped';
    }

    private clearTimers(): void {
        if (this.flushTimer) clearInterval(this.flushTimer);
        if (this.inputTimer) clearTimeout(this.inputTimer);
        this.flushTimer = null;
        this.inputTimer = null;
    }

    private reportFailure(): void {
        if (this.failureReported) return;
        this.failureReported = true;
        try { this.options.onFailure?.(); } catch { /* callback failures must not escape */ }
    }
}
