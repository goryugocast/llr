// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ isMobile: false }));
vi.mock('obsidian', () => ({ Platform: platform }));
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

afterEach(() => { platform.isMobile = false; document.body.replaceChildren(); });

describe('native date picker activation', () => {
    it('opens the desktop picker from its visible label', () => {
        const { label, input } = controls();
        input.showPicker = vi.fn();
        wireNativeDatePicker(label, input);
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
        wireNativeDatePicker(label, input);
        expect(() => label.click()).not.toThrow();
        expect(click).toHaveBeenCalledOnce();
    });

    it('keeps the mobile label visible while the native input owns touch and accessibility', () => {
        platform.isMobile = true;
        const { host, label, input } = controls();
        input.showPicker = vi.fn();
        wireNativeDatePicker(label, input);
        expect(host.classList.contains('llr-native-date-picker')).toBe(true);
        expect(input.tabIndex).toBe(0);
        expect(input.getAttribute('aria-label')).toBe('表示日を選ぶ');
        expect(label.tabIndex).toBe(-1);
        expect(label.getAttribute('aria-hidden')).toBe('true');
        expect(label.textContent).toBe('11-11');
        expect(label.hidden).toBe(false);
        expect(label.onclick).toBeNull();
        input.click();
        expect(input.showPicker).not.toHaveBeenCalled();
    });

    it('does not move mobile focus to the hidden accessibility label after selection', () => {
        platform.isMobile = true;
        const { label, input } = controls();
        wireNativeDatePicker(label, input);
        input.focus();
        finishNativeDateSelection(label, input);
        expect(document.activeElement).not.toBe(input);
        expect(document.activeElement).not.toBe(label);
        expect(label.textContent).toBe('11-11');
    });
});
