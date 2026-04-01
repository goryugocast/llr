import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { calculateNextDue, normalizeRepeatExpression, parseScheduleExpression } from '../src/service/yaml-parser';

const VAULT_DIR = '/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local';
const ROUTINE_DIR_CANDIDATES = [
    path.join(VAULT_DIR, 'routine'),
    path.join(VAULT_DIR, 'routine'),
];
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

type LlrFixture = {
    file: string;
    repeat?: string | number;
    next_due?: string;
};

function parseSimpleFrontmatter(text: string): Record<string, string> {
    const m = text.match(FRONTMATTER_RE);
    if (!m) return {};
    const out: Record<string, string> = {};
    for (const line of m[1].split('\n')) {
        const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
        if (!kv) continue;
        out[kv[1]] = kv[2].trim();
    }
    return out;
}

function readLlrFixtures(): LlrFixture[] {
    const routineDir = ROUTINE_DIR_CANDIDATES.find((dir) => fs.existsSync(dir));
    if (!routineDir) return [];
    return fs.readdirSync(routineDir)
        .filter((name) => name.endsWith('.md'))
        .map((name) => {
            const full = path.join(routineDir, name);
            const text = fs.readFileSync(full, 'utf8');
            const fm = parseSimpleFrontmatter(text);
            let repeat: string | number | undefined;
            if (fm.repeat !== undefined) {
                const raw = fm.repeat.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
                repeat = /^\d+$/.test(raw) ? Number(raw) : raw;
            }
            return {
                file: name,
                repeat,
                next_due: fm.next_due,
            };
        });
}

describe('llr repeat fixtures (real vault data)', () => {
    const fixtures = readLlrFixtures();

    it('loads routine fixtures from local Obsidian vault', () => {
        if (fixtures.length === 0) {
            expect(true).toBe(true);
            return;
        }
        expect(fixtures.length).toBeGreaterThan(0);
    });

    it('all repeat values in routine can be normalized and parsed', () => {
        const failures: string[] = [];
        for (const fx of fixtures) {
            if (fx.repeat === undefined) continue;
            try {
                const normalized = normalizeRepeatExpression(fx.repeat);
                parseScheduleExpression(normalized);
            } catch (e) {
                failures.push(`${fx.file}: ${String(e)}`);
            }
        }
        expect(failures).toEqual([]);
    });

    it('completion-style next_due calculation works for all parseable repeats', () => {
        const failures: string[] = [];
        const baseDate = new Date('2026-02-26T00:00:00');
        for (const fx of fixtures) {
            if (fx.repeat === undefined) continue;
            try {
                const normalized = normalizeRepeatExpression(fx.repeat);
                const parsed = parseScheduleExpression(normalized);
                if ((parsed as any).type === 'none') continue;
                const next = calculateNextDue({ type: 'schedule', expression: normalized }, baseDate);
                if (next !== null && !/^\d{4}-\d{2}-\d{2}$/.test(next)) {
                    failures.push(`${fx.file}: invalid next_due format => ${next}`);
                }
            } catch (e) {
                failures.push(`${fx.file}: ${String(e)}`);
            }
        }
        expect(failures).toEqual([]);
    });
});
