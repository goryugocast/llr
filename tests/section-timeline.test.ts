import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (importOriginal) => ({
    ...await importOriginal<typeof import('obsidian')>(),
    Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, AbstractInputSuggest: class {},
    normalizePath: (path: string) => path.replace(/\\/g, '/'),
}));

import LlrPlugin from '../src/main';
import { SummaryView } from '../src/view/summary-view';
import { DEFAULT_SETTINGS, normalizeSectionDefinitions, type SectionDefinition } from '../src/service/settings';
import { compareSectionBoundaries, resolveSectionLabel, sectionTimelineMinute } from '../src/service/section-timeline';
import { routineSortKey } from '../src/service/routine-sort';
import { computeSummaryData, buildSummaryPresentation } from '../src/service/summary-calculator';
import { calculateDuration } from '../src/service/time-calculator';

const definitions = [
    { time: '0000', label: 'Late' },
    { time: '0600', label: 'Morning' },
    { time: '0900', label: 'Work' },
    { time: '2100', label: 'Night' },
];
const boundaries = (defs: SectionDefinition[]) => defs.map(d => ({ value: Number(d.time), label: d.label })).sort(compareSectionBoundaries);

// Run the real settings load/save, insertion and summary label methods without app I/O.
function makePlugin(data: Record<string, unknown>) {
    let saved = structuredClone(data);
    const plugin = Object.create(LlrPlugin.prototype) as Pick<LlrPlugin, 'loadSettings' | 'getSectionDefinitions' | 'setSectionDefinitions'> & {
        getSortedSectionBoundaries(): ReturnType<typeof boundaries>;
        getRoutineSectionHeading(value: number | undefined): string | null;
        buildRoutineInsertLines(date: Date): Promise<string[]>;
        routineEngine: { fetchDueRoutines(): unknown[] };
        debugLog(): void;
    };
    Object.assign(plugin, {
        loadData: async () => structuredClone(saved),
        saveData: async (value: Record<string, unknown>) => { saved = JSON.parse(JSON.stringify(value)); },
        debugLog: vi.fn(),
    });
    return { plugin, saved: () => saved };
}

function summaryView(plugin: ReturnType<typeof makePlugin>['plugin']) {
    return Object.assign(Object.create(SummaryView.prototype), {
        delegate: { getSectionBoundaries: () => plugin.getSortedSectionBoundaries() },
    }) as { resolveSectionLabelForItem(item: { displayStartTime: string; times: string[] }): string | null };
}

describe('logical-day section timeline', () => {
    it('orders midnight after night, with 03:00 inclusive at the start of the next logical day', () => {
        const defs = normalizeSectionDefinitions([...definitions,
            { time: '0259', label: 'Last' }, { time: '0300', label: 'Boundary' },
            { time: '0500', label: 'Early' }, { time: '2359', label: 'Before midnight' },
        ]);
        expect(defs.map(d => d.time)).toEqual(['0300', '0500', '0600', '0900', '2100', '2359', '0000', '0259']);
        expect(sectionTimelineMinute(259)).toBe(1619);
        expect(sectionTimelineMinute(300)).toBe(180);
    });

    it('uses the existing configurable cutoff helper, without fixing 00:00–06:00 as late', () => {
        expect(sectionTimelineMinute(0, '0000')).toBe(0);
        expect(sectionTimelineMinute(559, '0600')).toBe(1799);
        expect(sectionTimelineMinute(600, '0600')).toBe(360);
        expect(sectionTimelineMinute(0, 'bad')).toBe(1440);
        expect(sectionTimelineMinute(500)).toBe(300);
    });

    it('retains ordinary defaults, empty settings, validation and label tie breaking', () => {
        expect(normalizeSectionDefinitions(undefined)).toEqual(DEFAULT_SETTINGS.sectionDefinitions);
        expect(normalizeSectionDefinitions([])).toEqual([]);
        expect(normalizeSectionDefinitions([{ time: '2400', label: 'Invalid' }, { time: '0060', label: 'Invalid' }])).toEqual([]);
        const tied = normalizeSectionDefinitions([{ time: '0000', label: 'B' }, { time: '0000', label: 'A' }]);
        expect(tied.map(d => d.label)).toEqual(['A', 'B']);
        expect(resolveSectionLabel(0, boundaries(tied))).toBe('B');
        expect(resolveSectionLabel(0, [])).toBeNull();
    });

    it('resolves midnight, late night, morning, extended 2400 and exact section boundaries', () => {
        const defs = boundaries(definitions);
        for (const [time, label] of [[0, 'Late'], [30, 'Late'], [259, 'Late'], [600, 'Morning'], [859, 'Morning'], [900, 'Work'], [2100, 'Night'], [2359, 'Night'], [2400, 'Late']] as const) {
            expect(resolveSectionLabel(time, defs)).toBe(label);
        }
        expect(resolveSectionLabel(300, defs)).toBeNull();
        expect(resolveSectionLabel(559, defs)).toBeNull();
        expect(resolveSectionLabel(NaN, defs)).toBeNull();
        expect(resolveSectionLabel(0, boundaries(DEFAULT_SETTINGS.sectionDefinitions))).toBe('夜');
    });

    it('sorts routine section and start times on the same timeline, preserving stable ties and no-section placement', () => {
        const items = [
            { name: 'Late2', section: 0, start: 30 }, { name: 'Night', section: 2100, start: 2100 },
            { name: 'Late1', section: 0, start: 0 }, { name: 'Morning', section: 600, start: 600 },
            { name: 'Sleep', section: 2400, start: undefined }, { name: 'Tie', section: 0, start: 0 },
            { name: 'None', section: undefined, start: 800 },
        ];
        const sorted = [...items].sort((a, b) => {
            const ak = routineSortKey(a), bk = routineSortKey(b);
            return ak[0] - bk[0] || ak[1] - bk[1];
        });
        expect(sorted.map(d => d.name)).toEqual(['Morning', 'Night', 'Late1', 'Tie', 'Late2', 'Sleep', 'None']);
        const withinNight = [{ section: 2100, start: 0 }, { section: 2100, start: 2300 }];
        expect(routineSortKey(withinNight[0])[1]).toBeGreaterThan(routineSortKey(withinNight[1])[1]);
    });

    it('keeps real settings save/reload, insertion headings and summary labels consistent after editing', async () => {
        const { plugin, saved } = makePlugin({ sectionDefinitions: definitions, legacyValue: 'keep' });
        await plugin.loadSettings();
        expect(plugin.getSectionDefinitions().map(d => d.time)).toEqual(['0600', '0900', '2100', '0000']);
        const edited = plugin.getSectionDefinitions();
        edited.find(d => d.time === '0900')!.time = '0100';
        await plugin.setSectionDefinitions(edited);
        expect(saved().legacyValue).toBe('keep');
        expect(saved().sectionDefinitions).toEqual(plugin.getSectionDefinitions());
        await plugin.loadSettings();
        expect(plugin.getSectionDefinitions().map(d => d.time)).toEqual(['0600', '2100', '0000', '0100']);
        const view = summaryView(plugin);
        for (const [time, text] of [[0, '00:00'], [100, '01:00'], [600, '06:00'], [2100, '21:00']] as const) {
            expect(plugin.getRoutineSectionHeading(time)).toBe(`# ${view.resolveSectionLabelForItem({ displayStartTime: text, times: [] })}`);
        }
        plugin.routineEngine = { fetchDueRoutines: () => [
            { file: { basename: 'Late' }, section: [0], start: 0 },
            { file: { basename: 'Morning' }, section: [600], start: 600 },
            { file: { basename: 'Night' }, section: [2100], start: 2100 },
        ] };
        expect(await plugin.buildRoutineInsertLines(new Date('2026-10-07T12:00:00Z'))).toEqual([
            '# Morning', '- [ ] 06:00 [[Morning]]', '# Night', '- [ ] 21:00 [[Night]]', '# Late', '- [ ] 00:00 [[Late]]',
        ]);
    });

    it('keeps midnight tasks visible and estimated before an existing section:2400 sleep boundary', async () => {
        const { plugin } = makePlugin({ sectionDefinitions: definitions });
        await plugin.loadSettings();
        plugin.routineEngine = { fetchDueRoutines: () => [
            { file: { basename: 'Sleep' }, section: [2400], estimate: 480 },
            { file: { basename: 'Late' }, section: [0], start: 0, estimate: 10 },
            { file: { basename: 'Last' }, section: [259], start: 259, estimate: 10 },
            { file: { basename: 'Night' }, section: [2100], estimate: 10 },
            { file: { basename: 'Morning' }, section: [600], estimate: 10 },
        ] };
        const lines = await plugin.buildRoutineInsertLines(new Date('2026-10-07T12:00:00Z'));
        expect(lines.filter(line => line.startsWith('- '))).toEqual([
            '- [ ] [[Morning]] (10m)', '- [ ] [[Night]] (10m)',
            '- [ ] 00:00 [[Late]] (10m)', '- [ ] 02:59 [[Last]] (10m)', '- [ ] [[Sleep]] (480m)',
        ]);
        const view = summaryView(plugin);
        const presentation = buildSummaryPresentation(computeSummaryData(lines, '23:50', calculateDuration), {
            nowTime: '23:50', isSleepItem: item => item.text.includes('[[Sleep]]'), resolveWarningRatio: () => 0,
            resolveSectionLabel: item => view.resolveSectionLabelForItem({ ...item, displayStartTime: item.displayStartTime! }),
        });
        expect(presentation.hiddenItems).toEqual([]);
        expect(presentation.futureGroups.flatMap(group => group.items).map(item => item.text)).toEqual(lines.filter(line => line.startsWith('- ')));
        expect(presentation.header.total).toBe('0h40m');
        expect(presentation.header.wake).toBeDefined();
    });

    it('keeps completed summary groups in morning → night → midnight order and future execution in note order', async () => {
        const { plugin } = makePlugin({ sectionDefinitions: definitions });
        await plugin.loadSettings();
        const view = summaryView(plugin);
        const lines = ['- [x] Late 00:00 - 00:10 (10m)', '- [x] Night 21:00 - 21:10 (10m)', '- [x] Morning 06:00 - 06:10 (10m)'];
        const data = computeSummaryData(lines, '23:50', calculateDuration);
        const options = {
            nowTime: '23:50', isSleepItem: () => false, resolveWarningRatio: () => 0,
            resolveSectionLabel: (item: { displayStartTime?: string; times: string[] }) => view.resolveSectionLabelForItem({ ...item, displayStartTime: item.displayStartTime! }),
        };
        const presentation = buildSummaryPresentation(data, options);
        expect(presentation.pastGroups.map(g => g.sectionLabel)).toEqual(['Morning', 'Night', 'Late']);
        const future = buildSummaryPresentation(computeSummaryData(['- [ ] First (20m)', '- [ ] Second (10m)'], '23:50', calculateDuration), options);
        expect(future.futureGroups.flatMap(g => g.items).map(i => i.line)).toEqual([0, 1]);
        expect(future.futureGroups.map(g => g.sectionLabel)).toEqual(['Night', 'Late']);
    });
});
