import { describe, expect, it } from 'vitest';
import { isDailyNoteMatch, resolveDailyNoteDate, resolveReferenceDate, type DailyNoteDescriptor, type DailyNoteSettings } from '../src/service/daily-note-context';

function parseByFormat(basename: string, format: string): Date | null {
    if (format === 'YYYY-MM-DD' && /^\d{4}-\d{2}-\d{2}$/.test(basename)) {
        const [y, m, d] = basename.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d));
    }
    if (format === 'YYYYMMDD' && /^\d{8}$/.test(basename)) {
        return new Date(Date.UTC(
            Number(basename.slice(0, 4)),
            Number(basename.slice(4, 6)) - 1,
            Number(basename.slice(6, 8))
        ));
    }
    return null;
}

describe('daily-note-context', () => {
    const file = (overrides: Partial<DailyNoteDescriptor> = {}): DailyNoteDescriptor => ({
        path: 'daily/2026-02-27.md',
        basename: '2026-02-27',
        extension: 'md',
        ...overrides,
    });

    const settings = (overrides: Partial<DailyNoteSettings> = {}): DailyNoteSettings => ({
        enabled: true,
        format: 'YYYY-MM-DD',
        folder: 'daily',
        ...overrides,
    });

    it('matches a daily note using configured folder and format', () => {
        expect(isDailyNoteMatch(file(), settings(), parseByFormat)).toBe(true);
    });

    it('rejects files outside the configured folder', () => {
        expect(isDailyNoteMatch(file({ path: 'notes/2026-02-27.md' }), settings(), parseByFormat)).toBe(false);
    });

    it('rejects when daily notes plugin is disabled', () => {
        expect(isDailyNoteMatch(file(), settings({ enabled: false }), parseByFormat)).toBe(false);
    });

    it('resolves the file date when the file matches', () => {
        const resolved = resolveDailyNoteDate(file(), settings(), parseByFormat);
        expect(resolved?.toISOString()).toBe('2026-02-27T00:00:00.000Z');
    });

    it('returns null for non-matching files', () => {
        expect(resolveDailyNoteDate(file({ basename: 'memo' }), settings(), parseByFormat)).toBeNull();
    });

    it('prefers the primary date and clones it', () => {
        const primary = new Date('2026-02-27T00:00:00Z');
        const resolved = resolveReferenceDate(primary, new Date('2026-02-28T00:00:00Z'));
        expect(resolved.toISOString()).toBe('2026-02-27T00:00:00.000Z');
        expect(resolved).not.toBe(primary);
    });

    it('falls back to the supplied date when primary is null', () => {
        const fallback = new Date('2026-02-28T09:30:00Z');
        const resolved = resolveReferenceDate(null, fallback);
        expect(resolved.toISOString()).toBe('2026-02-28T09:30:00.000Z');
        expect(resolved).not.toBe(fallback);
    });
});
