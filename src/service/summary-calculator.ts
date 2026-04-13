import { computeStatusBarMetrics, estimateFromLineEnd, DurationCalculator } from './status-bar-calculator';
import { TaskParser } from './task-parser';
import { normalizeMinutesForCutoffTimeline } from './day-cutoff';

export interface SummaryItem {
    text: string;       // 元の行テキスト（ファイル書き戻しに使用）
    displayText: string; // タスク名のみ（時刻・見積を除いた純粋なコンテンツ）
    times: string[];    // ['09:00', '10:23'] など
    estimate: string;   // '58m' など（表示用）
    line: number;
    status: string;
    isDone: boolean;
    isRunning: boolean;
    duration: number;   // 分単位（バー描画用）
    displayStartTime?: string; // 表示用開始時刻 (HH:mm)
    displayEndTime?: string;   // 表示用終了時刻 (HH:mm)
    isProjected?: boolean;     // 見積に基づく予定時刻かどうか
    sortStartMinute?: number;  // 日付またぎ補正後の表示順キー
}

export interface SummaryHeader {
    date?: string;
    total: string;
    end: string;
    wake?: string;
}

export interface SummaryData {
    header: SummaryHeader;
    items: SummaryItem[];
}

export type SummaryItemRole = 'done' | 'running' | 'leftover-active' | 'future' | 'deferred';

export interface SummaryPresentationItem extends SummaryItem {
    role: SummaryItemRole;
    sectionLabel: string | null;
    warningRatio: number;
}

export interface SummaryRenderGroup {
    sectionLabel: string | null;
    warningRatio: number;
    showSection: boolean;
    items: SummaryPresentationItem[];
}

export interface SummaryPresentation {
    header: SummaryHeader;
    pastGroups: SummaryRenderGroup[];
    futureGroups: SummaryRenderGroup[];
    hiddenItems: SummaryPresentationItem[];
}

export interface SummaryPresentationOptions {
    nowTime: string;
    isSleepItem: (item: SummaryItem) => boolean;
    resolveSectionLabel: (item: SummaryItem) => string | null;
    resolveWarningRatio: (item: SummaryItem) => number;
}

export function computeSummaryData(
    lines: string[],
    nowTime: string,
    durationCalculator: DurationCalculator
): SummaryData {
    const { remainMin } = computeStatusBarMetrics(
        lines,
        -1,
        nowTime,
        durationCalculator
    );

    const doneItems: SummaryItem[] = [];
    const runningItems: SummaryItem[] = [];
    const upcomingItems: SummaryItem[] = [];

    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        // インデント行・タスク行でない行をスキップ
        if (lineText.match(/^\s+/) || !lineText.startsWith('- ')) continue;

        const parsed = TaskParser.parseLine(lineText);
        const isDone = parsed.status === 'x';
        const isRunning = parsed.status === '/';

        // タスク行のみ表示（チェックボックス付き行のみ）
        const hasCheckbox = lineText.match(/^- \[.\]/);
        if (!hasCheckbox) continue;

        const duration = estimateFromLineEnd(lineText);

        const item: SummaryItem = {
            text: lineText,
            displayText: parsed.content,
            times: parsed.times,
            estimate: parsed.estimate,
            line: i,
            status: parsed.status,
            isDone,
            isRunning,
            duration,
        };

        if (isDone) {
            doneItems.push(item);
        } else if (isRunning) {
            runningItems.push(item);
        } else {
            upcomingItems.push(item);
        }
    }

    // 現在時刻をパース
    const [nowH, nowM] = nowTime.split(':').map(Number);
    const nowDate = new Date();
    nowDate.setHours(nowH, nowM, 0, 0);

    for (const item of doneItems) {
        if (item.isDone) {
            if (item.times.length >= 2) {
                item.displayStartTime = item.times[0];
                item.displayEndTime = item.times[1];
            } else if (item.times.length === 1) {
                item.displayStartTime = item.times[0];
                item.displayEndTime = item.times[0];
            }
            item.isProjected = false;
        }
    }

    let plannedAnchorMinutes = nowH * 60 + nowM;
    for (const item of runningItems) {
        const startTimeStr = item.times.length > 0 ? item.times[0] : nowTime;
        item.displayStartTime = startTimeStr;
        const est = item.duration > 0 ? item.duration : 0;
        const startAbs = resolveRunningStartAbsoluteMinutes(startTimeStr, plannedAnchorMinutes);
        const endAbs = est > 0
            ? Math.max(plannedAnchorMinutes, startAbs + est)
            : plannedAnchorMinutes;
        item.displayEndTime = formatAbsoluteMinutes(endAbs);
        item.isProjected = true;
        plannedAnchorMinutes = Math.max(plannedAnchorMinutes, endAbs);
    }

    for (const item of upcomingItems) {
        const startTimeStr = formatAbsoluteMinutes(plannedAnchorMinutes);
        item.displayStartTime = startTimeStr;
        const est = item.duration > 0 ? item.duration : 0;
        plannedAnchorMinutes += est;
        item.displayEndTime = formatAbsoluteMinutes(plannedAnchorMinutes);
        item.isProjected = true;
    }

    sortItemsByClockTime(doneItems);
    const plannedItems = [...runningItems, ...upcomingItems];
    sortItemsByDisplayTimeline(plannedItems);

    // ヘッダー
    const totalText = remainMin > 0
        ? `${Math.floor(remainMin / 60)}h${remainMin % 60}m`
        : '-';

    let endText = '-';
    if (remainMin > 0) {
        const endDate = new Date(nowDate.getTime() + remainMin * 60 * 1000);
        endText = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
    }

    return {
        header: { total: totalText, end: endText },
        items: [...doneItems, ...plannedItems],
    };
}

export function buildSummaryPresentation(
    data: SummaryData,
    options: SummaryPresentationOptions
): SummaryPresentation {
    const visibleItems = dedupeVisibleItems(data.items);
    const pastItems = visibleItems
        .filter((item) => item.isDone)
        .map((item) => toPresentationItem(item, 'done', options));
    const hasCompletedSleep = visibleItems.some((item) => item.isDone && options.isSleepItem(item));
    const sleepBoundaryLine = findSleepBoundaryLine(visibleItems, options.isSleepItem);
    const { futureItems, hiddenItems } = hasCompletedSleep
        ? {
            futureItems: [],
            hiddenItems: visibleItems
                .filter((item) => !item.isDone)
                .map((item) => toPresentationItem(item, 'deferred', options)),
        }
        : buildFutureItems(
            visibleItems.filter((item) => !item.isDone),
            sleepBoundaryLine,
            options
        );
    recomputeFutureDisplayTimes(futureItems, options.nowTime);
    refreshPresentationFields(futureItems, options);

    return {
        header: buildPresentationHeader(data.header, options.nowTime, futureItems, options),
        pastGroups: buildRenderGroups(pastItems),
        futureGroups: buildRenderGroups(futureItems),
        hiddenItems,
    };
}

function parseDisplayTimeToMinutes(hhmm?: string): number | null {
    if (!hhmm) return null;
    const m = hhmm.match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
}

function sortItemsByDisplayTimeline(items: SummaryItem[]): void {
    let lastSortMinute: number | null = null;
    for (const item of items) {
        const startMin = parseDisplayTimeToMinutes(item.displayStartTime);
        if (startMin === null) continue;

        let normalized = startMin;
        while (lastSortMinute !== null && normalized < lastSortMinute) {
            normalized += 1440;
        }

        item.sortStartMinute = normalized;
        lastSortMinute = normalized;
    }

    items.sort((a, b) => {
        const aStart = a.sortStartMinute ?? parseDisplayTimeToMinutes(a.displayStartTime);
        const bStart = b.sortStartMinute ?? parseDisplayTimeToMinutes(b.displayStartTime);

        if (aStart !== null && bStart !== null && aStart !== bStart) {
            return aStart - bStart;
        }
        if (aStart !== null && bStart === null) return -1;
        if (aStart === null && bStart !== null) return 1;
        return a.line - b.line;
    });
}

function sortItemsByClockTime(items: SummaryItem[]): void {
    items.sort((a, b) => {
        const rawAStart = parseDisplayTimeToMinutes(a.displayStartTime);
        const rawBStart = parseDisplayTimeToMinutes(b.displayStartTime);
        const aStart = rawAStart === null ? null : normalizeMinutesForCutoffTimeline(rawAStart);
        const bStart = rawBStart === null ? null : normalizeMinutesForCutoffTimeline(rawBStart);

        if (aStart !== null && bStart !== null && aStart !== bStart) {
            return aStart - bStart;
        }
        if (aStart !== null && bStart === null) return -1;
        if (aStart === null && bStart !== null) return 1;
        return a.line - b.line;
    });

    for (const item of items) {
        const startMinute = parseDisplayTimeToMinutes(item.displayStartTime);
        item.sortStartMinute = startMinute === null
            ? undefined
            : normalizeMinutesForCutoffTimeline(startMinute);
    }
}

function formatAbsoluteMinutes(totalMinutes: number): string {
    const normalized = ((Math.trunc(totalMinutes) % 1440) + 1440) % 1440;
    const hh = Math.floor(normalized / 60);
    const mm = normalized % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function resolveRunningStartAbsoluteMinutes(startHHmm: string, anchorMinutes: number): number {
    const parsed = parseDisplayTimeToMinutes(startHHmm);
    if (parsed === null) return anchorMinutes;

    let absolute = parsed;
    while (absolute > anchorMinutes) {
        absolute -= 1440;
    }
    while (absolute + 1440 <= anchorMinutes) {
        absolute += 1440;
    }
    return absolute;
}

function dedupeVisibleItems(items: SummaryItem[]): SummaryItem[] {
    const renderedLines = new Set<number>();
    return items.filter((item) => {
        if (renderedLines.has(item.line)) return false;
        renderedLines.add(item.line);
        return true;
    });
}

function buildFutureItems(
    items: SummaryItem[],
    sleepBoundaryLine: number | null,
    options: SummaryPresentationOptions
): {
    futureItems: SummaryPresentationItem[];
    hiddenItems: SummaryPresentationItem[];
} {
    const visibleFutureSource = sleepBoundaryLine === null
        ? [...items]
        : items.filter((item) => item.line <= sleepBoundaryLine);
    const hiddenItems = sleepBoundaryLine === null
        ? []
        : items
            .filter((item) => item.line > sleepBoundaryLine)
            .map((item) => toPresentationItem(item, 'deferred', options));

    const runningSource = visibleFutureSource.filter((item) => item.isRunning);
    const firstRunningLine = runningSource.length > 0
        ? Math.min(...runningSource.map((item) => item.line))
        : null;

    const futureItems: SummaryPresentationItem[] = [];
    if (firstRunningLine === null) {
        for (const item of visibleFutureSource) {
            futureItems.push(toPresentationItem(item, 'future', options));
        }
        return { futureItems, hiddenItems };
    }

    const runningItems = runningSource.map((item) => toPresentationItem(item, 'running', options));
    const preRunningItems = visibleFutureSource
        .filter((item) => !item.isRunning && item.line < firstRunningLine)
        .sort((a, b) => a.line - b.line)
        .map((item) => toPresentationItem(item, 'leftover-active', options));
    const remainingItems = visibleFutureSource
        .filter((item) => !item.isRunning && item.line >= firstRunningLine)
        .sort((a, b) => a.line - b.line)
        .map((item) => toPresentationItem(item, 'future', options));

    futureItems.push(...runningItems, ...preRunningItems, ...remainingItems);
    return { futureItems, hiddenItems };
}

function findSleepBoundaryLine(
    items: SummaryItem[],
    isSleepItem: (item: SummaryItem) => boolean
): number | null {
    let sleepLine: number | null = null;
    for (const item of items) {
        if (!isSleepItem(item)) continue;
        sleepLine = sleepLine === null ? item.line : Math.min(sleepLine, item.line);
    }
    return sleepLine;
}

function toPresentationItem(
    item: SummaryItem,
    role: SummaryItemRole,
    options: SummaryPresentationOptions
): SummaryPresentationItem {
    return {
        ...item,
        role,
        sectionLabel: options.resolveSectionLabel(item),
        warningRatio: options.resolveWarningRatio(item),
    };
}

function refreshPresentationFields(
    items: SummaryPresentationItem[],
    options: SummaryPresentationOptions
): void {
    for (const item of items) {
        item.sectionLabel = options.resolveSectionLabel(item);
        item.warningRatio = options.resolveWarningRatio(item);
    }
}

function buildPresentationHeader(
    baseHeader: SummaryHeader,
    nowTime: string,
    headerItems: SummaryPresentationItem[],
    options: SummaryPresentationOptions
): SummaryHeader {
    const nowMinutes = parseDisplayTimeToMinutes(nowTime);
    if (nowMinutes === null) {
        return { ...baseHeader };
    }

    let normalRemainMin = 0;
    let sleepRemainMin = 0;
    for (const item of headerItems) {
        if (item.duration <= 0) continue;
        if (options.isSleepItem(item)) {
            sleepRemainMin += item.duration;
        } else {
            normalRemainMin += item.duration;
        }
    }

    const total = normalRemainMin > 0
        ? `${Math.floor(normalRemainMin / 60)}h${normalRemainMin % 60}m`
        : '-';
    const end = normalRemainMin > 0
        ? formatAbsoluteMinutes(nowMinutes + normalRemainMin)
        : (sleepRemainMin > 0 ? nowTime : baseHeader.end);
    const wake = sleepRemainMin > 0
        ? formatAbsoluteMinutes(nowMinutes + normalRemainMin + sleepRemainMin)
        : undefined;

    return {
        ...baseHeader,
        total,
        end,
        wake,
    };
}

function buildRenderGroups(items: SummaryPresentationItem[]): SummaryRenderGroup[] {
    if (items.length === 0) return [];

    const groups: SummaryRenderGroup[] = [];
    let currentGroup: SummaryRenderGroup | null = null;

    for (const item of items) {
        if (!currentGroup || currentGroup.sectionLabel !== item.sectionLabel) {
            currentGroup = {
                sectionLabel: item.sectionLabel,
                warningRatio: item.warningRatio,
                showSection: true,
                items: [item],
            };
            groups.push(currentGroup);
            continue;
        }

        currentGroup.items.push(item);
        currentGroup.warningRatio = Math.max(currentGroup.warningRatio, item.warningRatio);
    }

    return groups;
}

function recomputeFutureDisplayTimes(items: SummaryPresentationItem[], nowTime: string): void {
    const nowMinutes = parseDisplayTimeToMinutes(nowTime);
    if (nowMinutes === null) return;

    let plannedAnchorMinutes = nowMinutes;
    for (const item of items) {
        if (item.isRunning) {
            const startTimeStr = item.times.length > 0 ? item.times[0] : nowTime;
            item.displayStartTime = startTimeStr;
            const est = item.duration > 0 ? item.duration : 0;
            const startAbs = resolveRunningStartAbsoluteMinutes(startTimeStr, plannedAnchorMinutes);
            const endAbs = est > 0
                ? Math.max(plannedAnchorMinutes, startAbs + est)
                : plannedAnchorMinutes;
            item.displayEndTime = formatAbsoluteMinutes(endAbs);
            item.isProjected = true;
            item.sortStartMinute = startAbs;
            plannedAnchorMinutes = Math.max(plannedAnchorMinutes, endAbs);
            continue;
        }

        const startAbs = plannedAnchorMinutes;
        const est = item.duration > 0 ? item.duration : 0;
        item.displayStartTime = formatAbsoluteMinutes(startAbs);
        plannedAnchorMinutes += est;
        item.displayEndTime = formatAbsoluteMinutes(plannedAnchorMinutes);
        item.isProjected = true;
        item.sortStartMinute = startAbs;
    }
}
