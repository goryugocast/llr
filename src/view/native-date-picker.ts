import { Platform } from 'obsidian';

/** Keep mobile activation on the real date input rather than a synthetic picker call. */
export function wireNativeDatePicker(label: HTMLButtonElement, input: HTMLInputElement): void {
    if (Platform.isMobile) {
        input.parentElement?.classList.add('llr-native-date-picker');
        input.tabIndex = 0;
        label.tabIndex = -1;
        label.setAttribute('aria-hidden', 'true');
        return;
    }

    label.onclick = () => {
        input.focus({ preventScroll: true });
        if (typeof input.showPicker === 'function') {
            try {
                input.showPicker();
                return;
            } catch {
                // Some WebViews expose showPicker but do not implement this input type.
            }
        }
        input.click();
    };
}

export function finishNativeDateSelection(label: HTMLButtonElement, input: HTMLInputElement): void {
    if (Platform.isMobile) input.blur();
    else label.focus({ preventScroll: true });
}
