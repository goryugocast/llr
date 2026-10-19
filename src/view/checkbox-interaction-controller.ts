import { App, Editor, MarkdownView, Platform } from 'obsidian';
import type { CheckboxPressIntent } from '../service/task-transformer';
import { getCM6View } from './editor-internal';

/**
 * チェックボックス操作のジェスチャ検出層が LlrPlugin 側へ要求する操作。
 * Controller は DOM/座標/長押しタイマー/状態だけを所有し、実際のタスク変更（アクション層）や
 * 設定参照・UI 更新はこの delegate 経由で plugin に委ねる。
 */
export interface CheckboxInteractionDelegate {
    isOverrideEnabled(): boolean;
    isEditableMarkdownView(): boolean;
    /** デバッグログ用に行の状態ラベル（unstarted/running/...）を返す。 */
    getLineStateLabel(lineIndex: number): string;
    /** 解決済みの行に対してタップ/長押しのアクションを実行する。lineIndex が null なら行特定失敗。 */
    onCheckboxPress(intent: CheckboxPressIntent, lineIndex: number | null): void | Promise<void>;
    debugLog(message: string, data?: unknown): void;
    updateUI(): void;
}

/**
 * エディタ上のタスクチェックボックスに対する pointer/click ジェスチャを横取りし、
 * 短押し＝トグル / 長押し＝別アクションに振り分ける。行番号は data-line → CM6 API →
 * 視覚的近接の 3 段フォールバックで解決する。設定 OFF 時は一切介入しない。
 */
export class CheckboxInteractionController {
    private readonly longPressMsTouch = 450;
    private readonly longPressMsDesktop = 900;
    private longPressTimer: ReturnType<typeof setTimeout> | null = null;
    private suppressNextClick = false;
    private suppressResetTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingLineIndex: number | null = null;
    private pointerDownAtMs: number | null = null;
    private pointerDownPointerType: string | null = null;
    private pointerDownLineIndex: number | null = null;

    constructor(
        private readonly app: App,
        private readonly delegate: CheckboxInteractionDelegate,
    ) {}

    /** input/composition デバッグログが直近の pointerType を参照するために公開する。 */
    get lastPointerDownType(): string | null {
        return this.pointerDownPointerType;
    }

    onPointerDown(ev: PointerEvent): void {
        if (!this.delegate.isOverrideEnabled()) return;
        const target = this.getCheckboxAtPoint(ev.clientX, ev.clientY);
        if (!target || !this.delegate.isEditableMarkdownView()) return;
        if (ev.button !== 0 || ev.isPrimary === false) return;

        const { checkbox, lineIndex } = target;
        this.pendingLineIndex = lineIndex;
        this.pointerDownAtMs = Date.now();
        this.pointerDownPointerType = ev.pointerType || 'unknown';
        this.pointerDownLineIndex = lineIndex;

        this.clearLongPressTimer();
        const isTouchLike = Platform.isMobile || ev.pointerType === 'touch' || ev.pointerType === 'pen';
        const longPressMs = isTouchLike ? this.longPressMsTouch : this.longPressMsDesktop;
        this.delegate.debugLog('Checkbox pointerdown', {
            pointerType: ev.pointerType || 'unknown',
            button: ev.button,
            isPrimary: ev.isPrimary,
            lineIndex,
            lineState: this.delegate.getLineStateLabel(lineIndex),
            longPressMs,
        });

        this.longPressTimer = setTimeout(() => {
            const elapsedMs = this.pointerDownAtMs ? Date.now() - this.pointerDownAtMs : null;
            this.delegate.debugLog('Checkbox long press timeout fired', {
                pointerType: this.pointerDownPointerType,
                lineIndex: this.pointerDownLineIndex,
                elapsedMs,
            });
            this.suppressNextClick = true;
            if (this.suppressResetTimer) clearTimeout(this.suppressResetTimer);
            this.suppressResetTimer = setTimeout(() => {
                this.suppressNextClick = false;
                this.suppressResetTimer = null;
            }, 800);
            this.triggerHaptic(true);

            const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor ?? null;
            const resolvedLine = this.pendingLineIndex
                ?? (editor ? this.resolveLineIndex(editor, checkbox) : null);
            this.pendingLineIndex = null;
            void this.delegate.onCheckboxPress('long', resolvedLine);
        }, longPressMs);
    }

    onPointerUp(ev: PointerEvent): void {
        if (!this.delegate.isOverrideEnabled()) return;
        // Simple cleanup, no coordinate check needed
        const elapsedMs = this.pointerDownAtMs ? Date.now() - this.pointerDownAtMs : null;
        if (this.pointerDownAtMs !== null) {
            this.delegate.debugLog('Checkbox pointerup', {
                pointerType: ev.pointerType || 'unknown',
                elapsedMs,
                lineIndex: this.pointerDownLineIndex,
            });
        }
        this.clearLongPressTimer();
        this.pendingLineIndex = null;
        this.pointerDownAtMs = null;
        this.pointerDownPointerType = null;
        this.pointerDownLineIndex = null;
    }

    onPointerCancel(): void {
        this.clearLongPressTimer();
        this.pendingLineIndex = null;
    }

    onDocumentClick(ev: MouseEvent): void {
        if (!this.delegate.isOverrideEnabled()) return;
        // 通常ノートでは capture phase でイベントを横取りせず、Obsidian の標準操作に任せる。
        if (!this.delegate.isEditableMarkdownView()) {
            this.delegate.updateUI();
            return;
        }
        // モーダル（設定画面など）の中で発生したクリックには干渉しない
        if (ev.target instanceof Element && ev.target.closest('.modal-container')) return;

        const target = this.getCheckboxAtPoint(ev.clientX, ev.clientY);
        if (!target) {
            this.delegate.updateUI();
            return;
        }

        const { checkbox, lineIndex } = target;
        const elapsedSincePointerDownMs = this.pointerDownAtMs ? Date.now() - this.pointerDownAtMs : null;

        // Hijack the event
        ev.preventDefault();
        ev.stopImmediatePropagation();
        this.delegate.debugLog('Checkbox click intercepted', {
            lineIndex,
            suppressNextCheckboxClick: this.suppressNextClick,
            elapsedSincePointerDownMs,
        });

        if (this.suppressNextClick) {
            this.suppressNextClick = false;
            this.delegate.debugLog('Checkbox click suppressed after long press', {
                lineIndex,
                elapsedSincePointerDownMs,
            });
            this.delegate.updateUI();
            return;
        }

        this.triggerHaptic(false);
        if (checkbox instanceof HTMLElement && Platform.isMobile) {
            checkbox.blur();
        }

        // Defer to next tick so CM6 finishes click processing before document modification
        setTimeout(() => {
            void this.delegate.onCheckboxPress('short', lineIndex);
        }, 0);
    }

    /** 設定 OFF 時やアンロード時に保留中のジェスチャ状態を全消去する。 */
    reset(): void {
        this.clearLongPressTimer();
        if (this.suppressResetTimer) {
            clearTimeout(this.suppressResetTimer);
            this.suppressResetTimer = null;
        }
        this.suppressNextClick = false;
        this.pendingLineIndex = null;
        this.pointerDownAtMs = null;
        this.pointerDownPointerType = null;
        this.pointerDownLineIndex = null;
    }

    private clearLongPressTimer(): void {
        if (!this.longPressTimer) return;
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
    }

    private triggerHaptic(isLongPress: boolean): void {
        // iOS WebView may ignore this API. Use best-effort without failing behavior.
        const vibrate = window.navigator?.vibrate?.bind(window.navigator);
        if (!vibrate) return;
        if (!Platform.isMobile) return;

        if (isLongPress) {
            vibrate([20, 60, 20]);
            return;
        }
        vibrate(20);
    }

    /** 指定された座標にあるチェックボックスとその行番号を特定する。 */
    private getCheckboxAtPoint(x: number, y: number): { checkbox: HTMLElement; lineIndex: number } | null {
        const element = document.elementFromPoint(x, y);
        const checkbox = this.getCheckboxElement(element, x, y);
        if (!checkbox) return null;

        const padding = Platform.isMobile ? 6 : 3;
        if (!this.isCoordInsideElement(x, y, checkbox, padding)) return null;

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.editor) return null;

        // チェックボックスが現在のアクティブなエディタのDOM階層内にあるか確認
        // これにより設定画面・サイドバー・モーダル上の要素を完全に除外する
        if (!view.contentEl.contains(checkbox)) return null;

        const lineIndex = this.resolveLineIndex(view.editor, checkbox, { x, y });
        if (lineIndex === null) return null;

        // The coordinates/CodeMirror fallback may resolve a nearby YAML line.
        // Never dispatch a task action unless the actual editor line is a Markdown task.
        const sourceLine = view.editor.getLine(lineIndex);
        if (!/^\s*(?:[-*+]|\d+[.)])\s+\[[^\]\r\n]\](?:\s|$)/.test(sourceLine)) return null;

        return { checkbox, lineIndex };
    }

    private isCoordInsideElement(x: number, y: number, el: HTMLElement, padding = 0): boolean {
        const rect = el.getBoundingClientRect();
        return (
            x >= rect.left - padding &&
            x <= rect.right + padding &&
            y >= rect.top - padding &&
            y <= rect.bottom + padding
        );
    }

    private getCheckboxElement(target: EventTarget | null, x?: number, y?: number): HTMLElement | null {
        if (!(target instanceof Element)) return null;

        // Properties use their own checkboxes; leave frontmatter edits to Obsidian.
        if (target.closest('.metadata-container, .metadata-property, .frontmatter-container, .cm-hmd-frontmatter')) return null;

        // Only task checkboxes inside the Markdown editor, never arbitrary inputs.
        const direct = target.closest('.markdown-source-view .task-list-item-checkbox, .markdown-source-view .HyperMD-task-line input[type="checkbox"], .markdown-source-view .task-list-item input[type="checkbox"]');
        if (direct instanceof HTMLElement) return direct;

        // 2. 行内フォールバックは、チェックボックス近傍だけに限定する
        const line = target.closest('.HyperMD-task-line, .cm-line, .task-list-item');
        if (line instanceof HTMLElement) {
            const nested = line.querySelector('.task-list-item-checkbox, .HyperMD-task-line input[type="checkbox"], .task-list-item input[type="checkbox"]');
            if (nested instanceof HTMLElement && typeof x === 'number' && typeof y === 'number') {
                const fallbackPadding = Platform.isMobile ? 6 : 3;
                if (this.isCoordInsideElement(x, y, nested, fallbackPadding)) {
                    return nested;
                }
            }
        }

        return null;
    }

    private resolveLineIndex(
        editor: Editor,
        checkboxEl: HTMLElement,
        pointer?: { x: number; y: number }
    ): number | null {
        // Strategy 1: Data Attribute (Most reliable when available)
        const dataLine = checkboxEl.closest('.cm-line, [data-line]')?.getAttribute('data-line');
        if (dataLine) {
            const parsed = parseInt(dataLine, 10);
            if (!isNaN(parsed) && parsed >= 0) return parsed;
        }

        // Strategy 2: CodeMirror 6 API
        const cmView = getCM6View(editor);
        const offsetToPos = (editor as unknown as Record<string, unknown>)?.offsetToPos;

        if (cmView && typeof offsetToPos === 'function') {
            // a) Coordinate-based
            if (pointer && typeof cmView.posAtCoords === 'function') {
                try {
                    const offset = cmView.posAtCoords({ x: pointer.x, y: pointer.y });
                    if (offset !== null) {
                        const pos = offsetToPos.call(editor, offset);
                        if (pos && typeof pos.line === 'number') return pos.line;
                    }
                } catch (e) {
                    this.delegate.debugLog('CM6 posAtCoords failed', e);
                }
            }
            // b) Element-based
            if (typeof cmView.posAtDOM === 'function') {
                try {
                    const offset = cmView.posAtDOM(checkboxEl, 0);
                    const pos = offsetToPos.call(editor, offset);
                    if (pos && typeof pos.line === 'number') return pos.line;
                } catch (e) {
                    this.delegate.debugLog('CM6 posAtDOM failed', e);
                }
            }
        }

        // Strategy 3: Visual Proximity (Force fallback for widgets in mobile)
        if (pointer) {
            return this.resolveLineByProximity(checkboxEl, pointer.y);
        }

        return null;
    }

    private resolveLineByProximity(el: HTMLElement, y: number): number | null {
        const container = el.closest('.cm-content, .markdown-source-view');
        if (!container) return null;

        const lines = container.querySelectorAll('.cm-line, [data-line]');
        let bestLine: number | null = null;
        let minDist = Infinity;

        for (let i = 0; i < lines.length; i++) {
            const rect = lines[i].getBoundingClientRect();
            if (y >= rect.top - 2 && y <= rect.bottom + 2) {
                const dl = lines[i].getAttribute('data-line');
                if (dl) return parseInt(dl, 10);
            }
            const dist = Math.abs(y - (rect.top + rect.bottom) / 2);
            if (dist < minDist) {
                minDist = dist;
                const dl = lines[i].getAttribute('data-line');
                if (dl) bestLine = parseInt(dl, 10);
            }
        }
        return minDist < 20 ? bestLine : null;
    }
}
