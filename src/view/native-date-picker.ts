import { App, Modal, Platform } from 'obsidian';

/** Route the mobile label through a small dialog so its native date picker opens from a real tap. */
export function wireNativeDatePicker(label: HTMLButtonElement, input: HTMLInputElement, app: App, getToday: () => string = todayDate): void {
    if (Platform.isMobile) {
        input.tabIndex = -1;
        input.setAttribute('aria-hidden', 'true');
        label.tabIndex = 0;
        label.removeAttribute('aria-hidden');
        label.onclick = () => openMobileDateChooser(app, label, input, getToday);
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

function openMobileDateChooser(app: App, label: HTMLButtonElement, source: HTMLInputElement, getToday: () => string): void {
    const modal = new Modal(app);
    modal.modalEl.classList.add('llr-date-chooser');
    modal.setTitle('日付を選ぶ');

    const date = document.createElement('input');
    date.type = 'date';
    date.setAttribute('aria-label', '日付を選ぶ');
    date.value = source.value;
    if (source.min) date.min = source.min;
    if (source.max) date.max = source.max;

    let committed = false;
    const choose = (value: string): void => {
        if (committed) return;
        if (!isValidDay(value) || (date.min && value < date.min) || (date.max && value > date.max)) return;
        committed = true;
        source.value = value;
        source.dispatchEvent(new Event('change', { bubbles: true }));
        modal.close();
    };

    date.addEventListener('change', () => choose(date.value));
    const actions = document.createElement('div');
    actions.className = 'llr-date-chooser-actions';
    const today = document.createElement('button');
    today.type = 'button';
    today.textContent = '今日へ移動';
    actions.append(today);
    today.addEventListener('click', () => choose(getToday()));
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'キャンセル';
    actions.append(cancel);
    const field = document.createElement('div');
    field.className = 'llr-date-chooser-field';
    field.append(date);
    modal.contentEl.append(field, actions);
    cancel.addEventListener('click', () => modal.close());

    modal.open();
    modal.onClose = () => {
        if (!committed) label.focus({ preventScroll: true });
        modal.contentEl.replaceChildren();
    };
}

function isValidDay(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function todayDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function finishNativeDateSelection(label: HTMLButtonElement, input: HTMLInputElement): void {
    if (Platform.isMobile) input.blur();
    else label.focus({ preventScroll: true });
}
