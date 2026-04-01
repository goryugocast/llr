import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TFile } from 'obsidian';
import { RoutineEngine } from '../src/service/routine-engine';
import { normalizeRepeatExpression } from '../src/service/yaml-parser';

vi.mock('obsidian', () => ({
    TFile: class { },
    App: class { },
    Notice: class { },
}));

const ROUTINE_DIR = '/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/routine';
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const REQUIRED_TC_FIXTURES = [
    '☀️起床.md',
    '💡廊下のライト充電.md',
    '⛩️週次レビュー.md',
    '🧺シーツを洗う.md',
    '🖥️iPadセミナー当日サポート.md',
    '📚図書館へ行く.md',
];

const hasRequiredLlrFixtures = REQUIRED_TC_FIXTURES.every((name) => fs.existsSync(path.join(ROUTINE_DIR, name)));

function readFrontmatter(fileName: string): Record<string, string> {
    const full = path.join(ROUTINE_DIR, fileName);
    const text = fs.readFileSync(full, 'utf8');
    const m = text.match(FRONTMATTER_RE);
    const out: Record<string, string> = {};
    if (!m) return out;
    for (const line of m[1].split('\n')) {
        const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
        if (!kv) continue;
        out[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1');
    }
    return out;
}

function buildRoutineNoteFromTc(fileName: string): any {
    const fm = readFrontmatter(fileName);
    const repeat = fm.repeat;
    let frequency: any = undefined;
    if (repeat !== undefined) {
        const normalized = normalizeRepeatExpression(repeat);
        frequency = (normalized === 'none' || normalized === 'no')
            ? { type: 'none' }
            : { type: 'schedule', expression: normalized };
    }
    return {
        file: { path: `routine/${fileName}` } as unknown as TFile,
        frequency,
        next_due: fm.next_due,
    };
}

describe.skipIf(!hasRequiredLlrFixtures)('llr completion expectations (real vault fixtures)', () => {
    let mockApp: any;
    let engine: RoutineEngine;

    beforeEach(() => {
        mockApp = {
            metadataCache: { getFileCache: vi.fn() },
            fileManager: { processFrontMatter: vi.fn() },
            vault: {},
        };
        engine = new RoutineEngine(mockApp as any);
    });

    it('computes expected next_due for representative routine repeats on completion', async () => {
        const cases = [
            { file: '☀️起床.md', completion: '2026-02-26', expected: '2026-02-27' },      // repeat: 1
            { file: '💡廊下のライト充電.md', completion: '2026-02-26', expected: '2026-03-03' }, // repeat: 5
            { file: '⛩️週次レビュー.md', completion: '2026-02-26', expected: '2026-03-02' },    // 毎週月曜
            { file: '🧺シーツを洗う.md', completion: '2026-02-26', expected: '2026-02-28' },      // 毎週土曜
            { file: '🖥️iPadセミナー当日サポート.md', completion: '2026-02-26', expected: '2026-03-21' }, // 第3土曜日
            { file: '📚図書館へ行く.md', completion: '2026-02-26', expected: null },            // none (former 0)
        ] as const;

        for (const c of cases) {
            const routineNote = buildRoutineNoteFromTc(c.file);
            const updateSpy = vi.spyOn(engine, 'updateNextDue').mockResolvedValueOnce();
            await engine.processCompletion(routineNote, new Date(`${c.completion}T12:00:00`));
            expect(updateSpy).toHaveBeenCalledWith(
                expect.objectContaining({ path: `routine/${c.file}` }),
                expect.objectContaining({ nextDue: c.expected })
            );
            updateSpy.mockRestore();
        }
    });
});
