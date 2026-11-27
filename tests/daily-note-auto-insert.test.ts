import type { App, TFile } from 'obsidian';
import { afterEach, expect, it, vi } from 'vitest';
import { DailyNoteAutoInsertController } from '../src/service/daily-note-auto-insert';

vi.mock('obsidian', () => ({
    moment: () => ({ format: () => '2026-11-28' }),
    TFile: class {},
}));

const marker = '{{llr-today}}';
const stamp = '<!-- llr:routines-expanded 2026-11-28 -->';
const routine = '- [ ] [[散歩]]';

afterEach(() => vi.useRealTimers());

it.each([
    {
        scenario: 'preserves an edit saved while routines are being prepared',
        latest: `- [x] 朝食\n${marker}\n追記`,
        expected: `- [x] 朝食\n${routine}\n${stamp}\n追記`,
    },
    {
        scenario: 'respects removal of the marker',
        latest: '手動で予定を記入',
        expected: '手動で予定を記入',
    },
    {
        scenario: 'respects an expansion stamp saved by another writer',
        latest: `${routine}\n${stamp}\n${marker}`,
        expected: `${routine}\n${stamp}\n${marker}`,
    },
])('$scenario', async ({ latest, expected }) => {
    vi.useFakeTimers();
    let content = `- [ ] 朝食\n${marker}`;
    const vault = {
        read: async () => content,
        process: vi.fn(async (_file: TFile, update: (value: string) => string) => {
            content = update(content);
            return content;
        }),
    };
    const controller = new DailyNoteAutoInsertController({ vault } as unknown as App, {
        isDailyNoteFile: () => true,
        parseDailyNoteDate: () => new Date('2026-11-28T00:00:00'),
        getDailyNoteSettings: () => ({ enabled: true, folder: 'daily', format: 'YYYY-MM-DD' }),
        buildRoutineInsertLines: async () => {
            content = latest;
            return [routine];
        },
        debugLog: vi.fn(),
    });

    controller.schedule({ path: 'daily/2026-11-28.md' } as TFile);
    await vi.advanceTimersByTimeAsync(200);

    expect(vault.process).toHaveBeenCalledOnce();
    expect(content).toBe(expected);
});
