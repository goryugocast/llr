// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ isMobile: false }));
const modalState = vi.hoisted(() => ({ instances: [] as Array<{
    modalEl: HTMLElement; titleEl: HTMLElement; contentEl: HTMLElement; opened: boolean; onClose: () => void;
    open(): void; close(): void; setTitle(title: string): void;
}> }));
vi.mock('obsidian', () => ({
    Platform: platform,
    Modal: class {
        modalEl = document.createElement('div');
        titleEl = document.createElement('div');
        contentEl = document.createElement('div');
        opened = false;
        onClose = (): void => {};
        constructor() { modalState.instances.push(this); }
        open() { this.opened = true; document.body.append(this.modalEl); this.modalEl.append(this.titleEl, this.contentEl); }
        close() { this.opened = false; this.onClose(); this.modalEl.remove(); }
        setTitle(title: string) { this.titleEl.textContent = title; }
    },
}));
import { finishNativeDateSelection, wireNativeDatePicker } from '../src/view/native-date-picker';

function controls() {
    const host = document.createElement('div');
    const label = document.createElement('button');
    label.textContent = '11-11';
    const input = document.createElement('input');
    input.type = 'date';
    input.setAttribute('aria-label', '表示日を選ぶ');
    host.append(label, input);
    document.body.append(host);
    return { host, label, input };
}

afterEach(() => { platform.isMobile = false; modalState.instances = []; document.body.replaceChildren(); });

const app = {} as never;

describe('native date picker activation', () => {
    it('opens the desktop picker from its visible label', () => {
        const { label, input } = controls();
        input.showPicker = vi.fn();
        wireNativeDatePicker(label, input, app);
        label.click();
        expect(input.showPicker).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(input);
        finishNativeDateSelection(label, input);
        expect(document.activeElement).toBe(label);
    });

    it('falls back to the date input when an exposed picker API rejects activation', () => {
        const { label, input } = controls();
        input.showPicker = () => { throw new DOMException('unsupported', 'NotSupportedError'); };
        const click = vi.spyOn(input, 'click');
        wireNativeDatePicker(label, input, app);
        expect(() => label.click()).not.toThrow();
        expect(click).toHaveBeenCalledOnce();
    });

    it('opens a small native date chooser with an explicit today action on mobile', () => {
        platform.isMobile = true;
        const { host, label, input } = controls();
        input.value = '2026-11-11';
        input.max = '2026-11-13';
        input.showPicker = vi.fn();
        wireNativeDatePicker(label, input, app);
        expect(input.tabIndex).toBe(-1);
        expect(input.getAttribute('aria-hidden')).toBe('true');
        expect(input.getAttribute('aria-label')).toBe('表示日を選ぶ');
        expect(label.tabIndex).toBe(0);
        expect(label.hasAttribute('aria-hidden')).toBe(false);
        expect(label.textContent).toBe('11-11');
        expect(label.hidden).toBe(false);
        label.click();
        const modal = modalState.instances[0];
        expect(modal.opened).toBe(true);
        expect(modal.titleEl.textContent).toBe('日付を選ぶ');
        const date = modal.contentEl.querySelector('input[type="date"]') as HTMLInputElement;
        expect(date.value).toBe('2026-11-11');
        expect(date.max).toBe('2026-11-13');
        expect(input.showPicker).not.toHaveBeenCalled();
        expect(host.contains(input)).toBe(true);
    });

    it('commits one selected date and closes the chooser', () => {
        platform.isMobile = true;
        const { label, input } = controls();
        wireNativeDatePicker(label, input, app);
        const change = vi.fn();
        input.addEventListener('change', change);
        label.click();
        const modal = modalState.instances[0];
        const date = modal.contentEl.querySelector('input[type="date"]') as HTMLInputElement;
        date.value = '2026-11-12';
        date.dispatchEvent(new Event('change'));
        expect(input.value).toBe('2026-11-12');
        expect(change).toHaveBeenCalledOnce();
        expect(modal.opened).toBe(false);
        modal.onClose();
        expect(change).toHaveBeenCalledOnce();
    });

    it('can return to today and leaves the source unchanged when cancelled', () => {
        platform.isMobile = true;
        const { label, input } = controls();
        input.value = '2026-11-01';
        wireNativeDatePicker(label, input, app);
        const change = vi.fn();
        input.addEventListener('change', change);
        label.click();
        const first = modalState.instances[0];
        (Array.from(first.contentEl.querySelectorAll('button')).find(button => button.textContent === 'キャンセル') as HTMLButtonElement).click();
        expect(input.value).toBe('2026-11-01');
        expect(change).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(label);

        label.click();
        const second = modalState.instances[1];
        (Array.from(second.contentEl.querySelectorAll('button')).find(button => button.textContent === '今日へ移動') as HTMLButtonElement).click();
        expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(change).toHaveBeenCalledOnce();
        expect(second.opened).toBe(false);
    });

    it('returns focus to the visible date button when closed without selection', () => {
        platform.isMobile = true;
        const { label, input } = controls();
        wireNativeDatePicker(label, input, app);
        label.click();
        const modal = modalState.instances[0];
        modal.onClose(); // Obsidian also calls onClose for its Escape-key dismissal.
        expect(input.value).toBe('');
        expect(document.activeElement).toBe(label);
    });
});
