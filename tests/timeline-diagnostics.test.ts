import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimelineDiagnostics, TimelineDiagnosticEvent } from '../src/service/timeline-diagnostics';
import { App } from 'obsidian';

function createHarness(options: { failAppend?: boolean } = {}) {
    const files = new Map<string, string>();
    let failAppend = options.failAppend ?? false;
    const adapter = {
        exists: vi.fn(async (path: string) => path === 'llrlog' || files.has(path)),
        mkdir: vi.fn(async () => undefined),
        write: vi.fn(async (path: string, data: string) => { files.set(path, data); }),
        append: vi.fn(async (path: string, data: string) => {
            if (failAppend) throw new Error('private content should never be surfaced');
            files.set(path, `${files.get(path) ?? ''}${data}`);
        }),
    };
    const app = { vault: { adapter } } as unknown as App;
    const failures = vi.fn();
    const logger = new TimelineDiagnostics(app, {
        buildId: 'timeline-jump-diag-20261113-1',
        baseVersion: '0.5.1',
        platform: 'ios',
        onFailure: failures,
    });
    return { logger, adapter, files, failures, setFailAppend: (value: boolean): void => { failAppend = value; } };
}

function linesFor(files: Map<string, string>, path: string): Array<Record<string, unknown>> {
    return (files.get(path) ?? '').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

afterEach(() => vi.useRealTimers());

describe('TimelineDiagnostics', () => {
    it('is off by default and writes a uniquely named JSONL session only after start', async () => {
        const { logger, adapter, files } = createHarness();
        logger.record({ event: 'open', date: '2026-11-13' });
        expect(adapter.write).not.toHaveBeenCalled();
        expect(logger.active).toBe(false);

        const firstPath = await logger.start();
        expect(firstPath).toMatch(/^llrlog\/timeline-.+\.jsonl$/);
        expect(logger.active).toBe(true);
        const first = linesFor(files, firstPath as string);
        expect(first[0]).toMatchObject({ event: 'session-start', phase: 'start', platform: 'ios', baseVersion: '0.5.1' });
        expect(first[0].sequence).toBe(1);
        await logger.stop();
        expect(logger.active).toBe(false);

        const { logger: second } = createHarness();
        const secondPath = await second.start();
        expect(secondPath).not.toBe(firstPath);
        await second.stop();
    });

    it('serializes typed safe fields, strips arbitrary fields and flushes terminal sequence on stop', async () => {
        const { logger, files } = createHarness();
        const path = await logger.start();
        logger.record({
            event: 'anchor-capture', date: '2026-11-13', anchorId: 5, anchorDay: '2026-11-13', anchorKind: 'record',
            anchorOffset: 12.5, top: 40, scrollHeight: 900, viewportHeight: 600,
            extra: 'secret title and note text',
        } as TimelineDiagnosticEvent & { extra: string });
        const result = await logger.stop('user-stop');
        const records = linesFor(files, path as string);
        expect(records[1]).toMatchObject({ event: 'anchor-capture', anchorId: 5, anchorOffset: 12.5, anchorKind: 'record' });
        expect(JSON.stringify(records)).not.toContain('secret title');
        expect(records[2]).toMatchObject({ event: 'session-stop', phase: 'stop', reason: 'user-stop', terminalSequence: 3 });
        expect(result).toMatchObject({ path, reason: 'user-stop', records: 3, dropped: 0 });
        expect(records.map((record) => record.sequence)).toEqual([1, 2, 3]);
    });

    it('coalesces touch movement at 33ms and records the suppressed sample count', async () => {
        vi.useFakeTimers();
        const { logger, files } = createHarness();
        const path = await logger.start();
        logger.record({ event: 'input', inputKind: 'touchmove', top: 20, deltaY: 2 });
        logger.record({ event: 'input', inputKind: 'touchmove', top: 23, deltaY: 3 });
        await logger.stop();
        const records = linesFor(files, path as string);
        expect(records[1]).toMatchObject({ event: 'input', inputKind: 'touchmove', top: 23, deltaY: 3, suppressedCount: 1 });
        expect(records.filter((record) => record.event === 'input')).toHaveLength(1);
    });

    it('coalesces scroll events even when inputKind is unavailable', async () => {
        vi.useFakeTimers();
        const { logger, files } = createHarness();
        const path = await logger.start();
        logger.record({ event: 'scroll', top: 20, deltaY: 2 });
        logger.record({ event: 'scroll', top: 23, deltaY: 3 });
        await logger.stop();
        const records = linesFor(files, path as string);
        expect(records.filter((record) => record.event === 'scroll')).toHaveLength(1);
        expect(records[1]).toMatchObject({ event: 'scroll', top: 23, deltaY: 3, suppressedCount: 1 });
    });

    it('does not coalesce scroll samples across timeline views', async () => {
        vi.useFakeTimers();
        const { logger, files } = createHarness();
        const path = await logger.start();
        logger.record({ event: 'scroll', viewId: 1, top: 10 });
        logger.record({ event: 'scroll', viewId: 2, top: 20 });
        await logger.stop();
        const scrolls = linesFor(files, path as string).filter((record) => record.event === 'scroll');
        expect(scrolls).toHaveLength(2);
        expect(scrolls.map((record) => record.viewId)).toEqual([1, 2]);
    });

    it('starts a fresh session after stop and after stop-before-start', async () => {
        const { logger, files } = createHarness();
        const beforeStartStop = await logger.stop();
        expect(beforeStartStop.path).toBeNull();

        const firstPath = await logger.start();
        logger.record({ event: 'open', date: '2026-11-13' });
        await logger.stop();

        const secondPath = await logger.start();
        expect(secondPath).not.toBe(firstPath);
        expect(logger.active).toBe(true);
        logger.record({ event: 'close' });
        await logger.stop();

        expect(linesFor(files, firstPath as string).map((record) => record.sequence)).toEqual([1, 2, 3]);
        expect(linesFor(files, secondPath as string).map((record) => record.sequence)).toEqual([1, 2, 3]);
    });

    it('waits for an in-flight start before stopping that new session', async () => {
        const { logger, files } = createHarness();
        const startPromise = logger.start();
        const stopPromise = logger.stop('immediate-stop');
        const path = await startPromise;
        const stopped = await stopPromise;
        expect(stopped.path).toBe(path);
        expect(logger.active).toBe(false);
        expect(linesFor(files, path as string).at(-1)).toMatchObject({ event: 'session-stop', reason: 'immediate-stop' });

        const retryPath = await logger.start();
        expect(retryPath).not.toBe(path);
        await logger.stop();
    });

    it('retries with a clean session after an append I/O failure', async () => {
        const { logger, failures, setFailAppend, files } = createHarness({ failAppend: true });
        const failedPath = await logger.start();
        logger.record({ event: 'close' });
        await expect(logger.stop()).resolves.toMatchObject({ reason: 'io-error' });
        expect(failures).toHaveBeenCalledTimes(1);

        setFailAppend(false);
        const retryPath = await logger.start();
        expect(retryPath).not.toBe(failedPath);
        logger.record({ event: 'open' });
        await logger.stop();
        expect(linesFor(files, retryPath as string).map((record) => record.event)).toEqual(['session-start', 'open', 'session-stop']);
        expect(failures).toHaveBeenCalledTimes(1);
    });

    it('auto-stops at the record cap with a terminal reason and drop count', async () => {
        const { logger, files } = createHarness();
        const path = await logger.start();
        for (let i = 0; i < 5100; i += 1) logger.record({ event: 'snapshot', viewId: 1, visibleCount: i });
        expect(logger.active).toBe(false);
        await logger.stop();
        const records = linesFor(files, path as string);
        expect(records).toHaveLength(5000);
        expect(records.at(-1)).toMatchObject({ event: 'auto-stop', reason: 'record-limit', dropped: 1, phase: 'stop' });
        expect(records.at(-1)?.terminalSequence).toBe(records.at(-1)?.sequence);
    });

    it('reports an append failure once and keeps it from escaping stop or unload', async () => {
        const { logger, failures } = createHarness({ failAppend: true });
        await logger.start();
        logger.record({ event: 'close' });
        await expect(logger.stop()).resolves.toMatchObject({ reason: 'io-error' });
        logger.unload();
        await Promise.resolve();
        expect(failures).toHaveBeenCalledTimes(1);
        expect(logger.active).toBe(false);
    });
});
