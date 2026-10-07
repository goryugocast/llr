import { normalizePath } from 'obsidian';
import type { UILanguage } from '../i18n';
import { compareSectionBoundaries } from './section-timeline';

/**
 * プラグイン設定の型・既定値・正規化。
 *
 * loadData() で読んだ生値は形が保証されないので、ここの normalize 系関数を通してから使う。
 * main.ts（読み書き）と settings-tab.ts（編集 UI）の両方から参照される。
 */

export interface SectionDefinition {
    time: string; // HHmm
    label: string;
}

export interface LlrSettings {
    debugModeEnabled: boolean;
    estimateWarningEnabled: boolean;
    checkboxOverrideEnabled: boolean;
    startAndOpenEnabled: boolean;
    mobileLargeCheckboxEnabled: boolean;
    uiLanguage: UILanguage;
    routineFolder: string;
    dailyNoteFolder: string;
    srsGrowthEnabled: boolean;
    srsMaxDaily: number;
    sectionDefinitions: SectionDefinition[];
}

export const DEFAULT_ROUTINE_FOLDER = 'routine';

export const DEFAULT_SETTINGS: LlrSettings = {
    debugModeEnabled: false,
    estimateWarningEnabled: true,
    checkboxOverrideEnabled: true,
    startAndOpenEnabled: false,
    mobileLargeCheckboxEnabled: false,
    uiLanguage: 'auto',
    routineFolder: DEFAULT_ROUTINE_FOLDER,
    dailyNoteFolder: '',
    srsGrowthEnabled: false,
    srsMaxDaily: 3,
    sectionDefinitions: [
        { time: '0700', label: '午前' },
        { time: '1200', label: '午後' },
        { time: '1800', label: '夜' },
    ],
};

/** 'HHmm' 文字列を比較用の数値（HH*100+mm）へ。形式・範囲が不正なら null。 */
export function parseSectionTimeToInt(value: string): number | null {
    if (!/^\d{4}$/.test(value)) return null;
    const hh = Number(value.slice(0, 2));
    const mm = Number(value.slice(2, 4));
    if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 100 + mm;
}

export function normalizeSectionDefinitions(input: unknown): SectionDefinition[] {
    if (!Array.isArray(input)) return DEFAULT_SETTINGS.sectionDefinitions.map((x) => ({ ...x }));

    const normalized: SectionDefinition[] = [];
    for (const item of input) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const rawTime = (typeof rec.time === 'string' ? rec.time : '').replace(/[^\d]/g, '').slice(0, 4);
        const label = (typeof rec.label === 'string' ? rec.label : '').trim();
        if (!label) continue;
        if (parseSectionTimeToInt(rawTime) === null) continue;
        normalized.push({ time: rawTime, label });
    }

    normalized.sort((a, b) => {
        const av = parseSectionTimeToInt(a.time) ?? Number.MAX_SAFE_INTEGER;
        const bv = parseSectionTimeToInt(b.time) ?? Number.MAX_SAFE_INTEGER;
        return compareSectionBoundaries({ value: av, label: a.label }, { value: bv, label: b.label });
    });

    return normalized;
}

export function normalizeRoutineFolder(value: unknown): string {
    const asText = typeof value === 'string' ? value : '';
    const normalizedPath = normalizePath(asText.trim()).replace(/^\/+/, '').replace(/\/+$/, '');
    return normalizedPath || DEFAULT_ROUTINE_FOLDER;
}

// Daily Notes プラグインの folder が空のときだけ使う補完値。
// 空文字は「補完なし（プラグインに完全に従う）」を意味するので、ルーチンと違って既定フォルダには倒さない。
export function normalizeDailyNoteFolder(value: unknown): string {
    const asText = typeof value === 'string' ? value : '';
    if (!asText.trim()) return '';
    return normalizePath(asText.trim()).replace(/^\/+/, '').replace(/\/+$/, '');
}
