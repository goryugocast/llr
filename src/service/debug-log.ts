import { App, normalizePath } from 'obsidian';

export interface DebugRecord {
    timestamp: string;
    localTime: string;
    source: 'plugin' | 'routine-engine';
    message: string;
    data?: unknown;
}

/**
 * デバッグログの出力先（Notice + llrlog/debug.jsonl）を一手に引き受ける。
 *
 * LlrPlugin 側には薄い debugLog() ラッパーと公開 API の showLlrNotice() だけが残り、
 * ここはファイル I/O・サイズトリム・書き込みキュー・整形といった機構を閉じ込める。
 * 有効/無効判定と Notice 表示は依存性注入（isEnabled / showNotice）で受け取り、
 * 設定や Notice throttle の責務とは結合させない。
 */
export class DebugLog {
    private folderEnsured = false;
    private writeQueue: Promise<void> = Promise.resolve();
    private readonly dir = 'llrlog';
    private readonly fileName = 'debug.jsonl';
    private readonly maxBytes = 5 * 1024 * 1024;
    private readonly trimBytes = 1 * 1024 * 1024;

    constructor(
        private readonly app: App,
        private readonly isEnabled: () => boolean,
        private readonly showNotice: (message: string, timeout?: number) => void,
    ) {}

    emit(source: 'plugin' | 'routine-engine', message: string, data?: unknown, options?: { notice?: boolean }): void {
        if (!this.isEnabled()) return;

        const now = new Date();
        const record: DebugRecord = {
            timestamp: now.toISOString(),
            localTime: this.formatLocalTime(now),
            source,
            message,
            ...(data !== undefined ? { data } : {}),
        };

        if (options?.notice !== false) {
            const noticeText = `[Debug ${record.localTime}] ${source} ${message}${this.summarizeData(data)}`;
            // Defer Notice to avoid DOM change during pointerdown suppressing iOS click event
            setTimeout(() => { this.showNotice(noticeText, 5000); }, 0);
        }
        void this.append(record);
    }

    private summarizeData(data: unknown): string {
        if (data === undefined) return '';
        try {
            const json = JSON.stringify(data);
            if (!json) return '';
            return json.length > 140 ? ` ${json.slice(0, 140)}...` : ` ${json}`;
        } catch {
            return ' [unserializable-data]';
        }
    }

    private formatLocalTime(date: Date): string {
        const hh = date.getHours().toString().padStart(2, '0');
        const mm = date.getMinutes().toString().padStart(2, '0');
        const ss = date.getSeconds().toString().padStart(2, '0');
        const ms = date.getMilliseconds().toString().padStart(3, '0');
        return `${hh}:${mm}:${ss}.${ms}`;
    }

    private filePath(): string {
        return normalizePath(`${this.dir}/${this.fileName}`);
    }

    private async ensureFolder(): Promise<void> {
        if (this.folderEnsured) return;

        const adapter = this.app.vault.adapter;
        const segments = this.dir.split('/').filter(Boolean);
        let current = '';

        for (const segment of segments) {
            current = current ? `${current}/${segment}` : segment;
            const path = normalizePath(current);
            if (!(await adapter.exists(path))) {
                await adapter.mkdir(path);
            }
        }

        this.folderEnsured = true;
    }

    private async append(record: DebugRecord): Promise<void> {
        this.writeQueue = this.writeQueue.then(async () => {
            try {
                await this.ensureFolder();
                const path = this.filePath();
                await this.trimIfNeeded(path);
                await this.app.vault.adapter.append(path, `${JSON.stringify(record)}\n`);
            } catch (error) {
                console.error('[LLR] Failed to write debug log', error);
            }
        });
        await this.writeQueue;
    }

    private async trimIfNeeded(path: string): Promise<void> {
        const adapter = this.app.vault.adapter;
        if (!(await adapter.exists(path))) return;

        let currentSize = 0;
        try {
            const stat = await adapter.stat(path);
            currentSize = stat?.size ?? 0;
        } catch {
            return;
        }

        if (currentSize <= this.maxBytes) return;

        const content = await adapter.read(path);
        const encoded = new TextEncoder().encode(content);
        if (encoded.length <= this.trimBytes) {
            await adapter.write(path, '');
            return;
        }

        // Rough trim: drop oldest ~1MB, then align to next newline.
        let dropAt = this.trimBytes;
        while (dropAt < encoded.length && encoded[dropAt] !== 0x0a) {
            dropAt += 1;
        }
        if (dropAt < encoded.length) dropAt += 1;

        const trimmed = new TextDecoder().decode(encoded.slice(dropAt));
        await adapter.write(path, trimmed);
    }
}
