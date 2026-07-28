import { describe, expect, it } from 'vitest';
import {
    isDailyNoteMatch,
    isFutureDailyNoteDate,
    resolveDailyNoteDate,
    resolveDailyNoteFolder,
    resolveMutationReferenceDate,
    resolveReferenceDate,
    type DailyNoteDescriptor,
    type DailyNoteSettings,
} from '../src/service/daily-note-context';

// moment(value, format, true) の strict パースを模す。format と形が一致しない文字列は null。
function parseByFormat(dateString: string, format: string): Date | null {
    if (format === 'YYYY-MM-DD' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        const [y, m, d] = dateString.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d));
    }
    if (format === 'YYYYMMDD' && /^\d{8}$/.test(dateString)) {
        return new Date(Date.UTC(
            Number(dateString.slice(0, 4)),
            Number(dateString.slice(4, 6)) - 1,
            Number(dateString.slice(6, 8))
        ));
    }
    if (format === 'YYYY/MM/YYYY-MM-DD' && /^\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        const datePart = dateString.slice(dateString.lastIndexOf('/') + 1);
        const [y, m, d] = datePart.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d));
    }
    return null;
}

describe('daily-note-context', () => {
    const file = (overrides: Partial<DailyNoteDescriptor> = {}): DailyNoteDescriptor => ({
        path: 'daily/2026-02-27.md',
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
        expect(resolveDailyNoteDate(file({ path: 'daily/memo.md' }), settings(), parseByFormat)).toBeNull();
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

    it('clamps future mutation dates to the runtime fallback day', () => {
        const resolved = resolveMutationReferenceDate(
            new Date('2026-03-01T00:00:00Z'),
            new Date('2026-02-28T09:30:00Z')
        );
        expect(resolved.toISOString()).toBe('2026-02-28T09:30:00.000Z');
    });

    it('keeps past mutation dates for retroactive completion', () => {
        const primary = new Date('2026-02-27T00:00:00Z');
        const resolved = resolveMutationReferenceDate(primary, new Date('2026-02-28T09:30:00Z'));
        expect(resolved.toISOString()).toBe('2026-02-27T00:00:00.000Z');
        expect(resolved).not.toBe(primary);
    });

    it('keeps same-day mutation dates (not clamped)', () => {
        const primary = new Date('2026-02-28T00:00:00Z');
        const resolved = resolveMutationReferenceDate(primary, new Date('2026-02-28T09:30:00Z'));
        expect(resolved.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    });

    it('matches a file with YYYYMMDD format', () => {
        expect(isDailyNoteMatch(
            file({ path: 'daily/20260227.md' }),
            settings({ format: 'YYYYMMDD' }),
            parseByFormat,
        )).toBe(true);
    });

    it('rejects files in a subfolder when the format has no slashes', () => {
        expect(isDailyNoteMatch(
            file({ path: 'daily/sub/2026-02-27.md' }),
            settings(),
            parseByFormat,
        )).toBe(false);
    });

    it('matches root-level files when folder is empty', () => {
        expect(isDailyNoteMatch(
            file({ path: '2026-02-27.md' }),
            settings({ folder: '' }),
            parseByFormat,
        )).toBe(true);
    });

    it('rejects root-level files in subfolders when folder is empty', () => {
        expect(isDailyNoteMatch(
            file({ path: 'sub/2026-02-27.md' }),
            settings({ folder: '' }),
            parseByFormat,
        )).toBe(false);
    });

    // 回帰: format にスラッシュを含む（年月サブフォルダ）構成 — v0.2.1 まで認識できなかった
    describe('slash-containing format (YYYY/MM/YYYY-MM-DD)', () => {
        const slashed = () => settings({ format: 'YYYY/MM/YYYY-MM-DD' });

        it('matches a note nested in year/month subfolders', () => {
            expect(isDailyNoteMatch(
                file({ path: 'daily/2026/02/2026-02-27.md' }),
                slashed(),
                parseByFormat,
            )).toBe(true);
        });

        it('resolves the date from the folder-relative path', () => {
            const resolved = resolveDailyNoteDate(
                file({ path: 'daily/2026/02/2026-02-27.md' }),
                slashed(),
                parseByFormat,
            );
            expect(resolved?.toISOString()).toBe('2026-02-27T00:00:00.000Z');
        });

        it('matches nested notes at vault root when folder is empty', () => {
            expect(isDailyNoteMatch(
                file({ path: '2026/02/2026-02-27.md' }),
                settings({ format: 'YYYY/MM/YYYY-MM-DD', folder: '' }),
                parseByFormat,
            )).toBe(true);
        });

        it('rejects a flat note that lacks the subfolder segments', () => {
            expect(isDailyNoteMatch(
                file({ path: 'daily/2026-02-27.md' }),
                slashed(),
                parseByFormat,
            )).toBe(false);
        });

        it('rejects notes outside the configured folder', () => {
            expect(isDailyNoteMatch(
                file({ path: 'notes/2026/02/2026-02-27.md' }),
                slashed(),
                parseByFormat,
            )).toBe(false);
        });
    });

    it('rejects non-md files', () => {
        expect(isDailyNoteMatch(
            file({ path: 'daily/2026-02-27.txt', extension: 'txt' }),
            settings(),
            parseByFormat,
        )).toBe(false);
    });

    // 未来ノートは state mutation の authority ではない（未来日付デイリーノートとルーチン基準日ポリシー 必須ルール B / D）。
    // 素の完了・@done・リスケジュールマーカーの3経路は、すべてこの判定を通す。
    describe('isFutureDailyNoteDate (state-mutation guard)', () => {
        // ローカル時刻で組み立てる。判定は暦日単位なので、実行環境の TZ に依存させない。
        const at = (year: number, month: number, day: number, hour = 0, minute = 0) =>
            new Date(year, month - 1, day, hour, minute);

        it('blocks a note dated after the runtime day', () => {
            expect(isFutureDailyNoteDate(at(2026, 3, 1), at(2026, 2, 28, 9, 30))).toBe(true);
        });

        it('allows the runtime day itself regardless of the time of day', () => {
            expect(isFutureDailyNoteDate(at(2026, 2, 28), at(2026, 2, 28, 23, 59))).toBe(false);
        });

        it('allows a past note so retroactive completion keeps working', () => {
            expect(isFutureDailyNoteDate(at(2026, 2, 27), at(2026, 2, 28, 9, 30))).toBe(false);
        });

        it('treats the next calendar day as future even one minute away', () => {
            expect(isFutureDailyNoteDate(at(2026, 3, 1, 0, 0), at(2026, 2, 28, 23, 59))).toBe(true);
        });

        it('allows files that are not daily notes (no parsed date)', () => {
            expect(isFutureDailyNoteDate(null, at(2026, 2, 28))).toBe(false);
        });
    });

    describe('resolveDailyNoteFolder', () => {
        it('uses the plugin folder when it is present', () => {
            expect(resolveDailyNoteFolder('Daily', 'Fallback')).toBe('Daily');
        });

        it('ignores the fallback even after the plugin folder changes', () => {
            // ユーザーがプラグイン側でフォルダを変えたら、LLR 補完値は黙って追従させない（陳腐化防止）。
            expect(resolveDailyNoteFolder('Journal', 'Daily')).toBe('Journal');
        });

        it('uses the fallback when the plugin folder is blank (settings reset)', () => {
            expect(resolveDailyNoteFolder('', 'Daily')).toBe('Daily');
        });

        it('treats a whitespace-only plugin folder as blank', () => {
            expect(resolveDailyNoteFolder('   ', 'Daily')).toBe('Daily');
        });

        it('returns root (empty) when both are blank', () => {
            expect(resolveDailyNoteFolder('', '')).toBe('');
        });
    });
});
