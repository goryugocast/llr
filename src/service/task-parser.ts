/**
 * TaskParser: タスク行を Status / Times / Estimate / Content に分解・合成する。
 */

export interface ParsedTask {
    status: string;   // ' ', '/', 'x', '-', 'plain'
    times: string[];  // ['09:00', '10:00'] など
    estimate: string; // '30m' など（括弧なし）
    content: string;  // 純粋なタスク名のみ
}

export class TaskParser {
    /**
     * タスク行を ParsedTask に分解する。
     */
    static parseLine(line: string): ParsedTask {
        let remaining = line.trim();

        // 1. Status の抽出
        let status = 'plain';
        const statusMatch = remaining.match(/^- \[(.)\]/);
        if (statusMatch) {
            status = statusMatch[1];
            remaining = remaining.slice(statusMatch[0].length).trimStart();
        } else if (remaining.startsWith('- ')) {
            remaining = remaining.slice(2).trimStart();
        }

        // 2. Times の抽出（先頭の 4 桁時刻も含めて planned start として扱う）
        const leadingTimeBlock = this.extractLeadingTimeBlock(remaining);
        if (leadingTimeBlock) {
            remaining = leadingTimeBlock.remaining;
        }

        const timePattern = /\d{2}:\d{2}/g;
        const matchedTimes = remaining.match(timePattern) ?? [];
        const times: string[] = leadingTimeBlock
            ? [...leadingTimeBlock.times, ...matchedTimes]
            : matchedTimes;

        if (!leadingTimeBlock) {
            // ダッシュ区切りを含む time ブロックを除去: "HH:mm - HH:mm" or "HH:mm"
            remaining = remaining.replace(/\d{2}:\d{2}\s*(?:-\s*\d{2}:\d{2})?/, '').trimStart();
        }
        // 先頭のダッシュ + 空白も除去（"- " が残るケース）
        remaining = remaining.replace(/^-\s*/, '').trimStart();

        // 3. Estimate の抽出（括弧内、または末尾の bare time 表記）
        let estimate = '';
        const estimateMatch = remaining.match(/\((\d+(?:\.\d+)?(?:h|m|min)(?:\s*>\s*\d+(?:\.\d+)?(?:h|m|min))?)\)/i);
        if (estimateMatch) {
            estimate = estimateMatch[1];
            remaining = remaining.replace(estimateMatch[0], '').trim();
        } else {
            // 例: "[[💪プッシュアップ]] 15m" / "読書 1h" / "散歩 30 min"
            const bareEstimateMatch = remaining.match(/(?:^|\s)(\d+(?:\.\d+)?\s*(?:h|m|min))\s*$/i);
            if (bareEstimateMatch) {
                estimate = bareEstimateMatch[1].replace(/\s+/g, '');
                remaining = remaining.slice(0, bareEstimateMatch.index).trimEnd();
            }
        }

        // 4. Content（残り）
        const content = remaining.trim();

        return { status, times, estimate, content };
    }

    /**
     * ParsedTask をタスク行文字列に合成する。
     */
    static serialize(parsed: ParsedTask): string {
        const parts: string[] = [];

        // status
        if (parsed.status === 'plain') {
            parts.push('-');
        } else {
            parts.push(`- [${parsed.status}]`);
        }

        // times
        if (parsed.times.length >= 2) {
            parts.push(`${parsed.times[0]} - ${parsed.times[1]}`);
        } else if (parsed.times.length === 1) {
            parts.push(`${parsed.times[0]} -`);
        }

        // estimate
        if (parsed.estimate) {
            parts.push(`(${parsed.estimate})`);
        }

        // content
        if (parsed.content) {
            parts.push(parsed.content);
        }

        return parts.join(' ');
    }

    /**
     * 時刻入力を HH:mm 形式に正規化する。
     * '900' → '09:00', '0930' → '09:30', '9:30' → '09:30'
     */
    static normalizeTime(input: string): string {
        // コロンを除いた数字のみを取得
        const digits = input.replace(/\D/g, '');

        if (digits.length === 3) {
            // '900' → '0900'
            const padded = digits.padStart(4, '0');
            return `${padded.slice(0, 2)}:${padded.slice(2)}`;
        }
        if (digits.length === 4) {
            return `${digits.slice(0, 2)}:${digits.slice(2)}`;
        }

        // すでに HH:mm 形式の場合はゼロ埋めだけ行う
        if (input.includes(':')) {
            const [h, m] = input.split(':');
            return `${h.padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
        }

        return input; // 変換不能の場合はそのまま返す
    }

    private static extractLeadingTimeBlock(remaining: string): { times: string[]; remaining: string } | null {
        const match = remaining.match(/^((?:\d{3,4}|\d{1,2}:\d{2}))(?:\s*-\s*((?:\d{3,4}|\d{1,2}:\d{2})))?\s*/);
        if (!match) return null;

        const first = this.normalizeLooseTimeToken(match[1]);
        if (!first) return null;

        const times = [first];
        if (match[2]) {
            const second = this.normalizeLooseTimeToken(match[2]);
            if (second) times.push(second);
        }

        return {
            times,
            remaining: remaining.slice(match[0].length).trimStart(),
        };
    }

    private static normalizeLooseTimeToken(input: string): string | null {
        const normalized = this.normalizeTime(input);
        const match = normalized.match(/^(\d{2}):(\d{2})$/);
        if (!match) return null;

        const hh = Number(match[1]);
        const mm = Number(match[2]);
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
        return normalized;
    }
}
