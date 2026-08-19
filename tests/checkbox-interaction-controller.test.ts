import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckboxInteractionController, type CheckboxInteractionDelegate } from '../src/view/checkbox-interaction-controller';

vi.mock('obsidian', () => ({
    App: class {},
    MarkdownView: class {},
    Platform: { isMobile: false },
}));

function buildDelegate(isEditableMarkdownView: boolean, isOverrideEnabled = true): CheckboxInteractionDelegate {
    return {
        isOverrideEnabled: () => isOverrideEnabled,
        isEditableMarkdownView: () => isEditableMarkdownView,
        getLineStateLabel: () => 'unstarted',
        onCheckboxPress: vi.fn(),
        debugLog: vi.fn(),
        updateUI: vi.fn(),
    };
}

describe('CheckboxInteractionController', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('does nothing when checkbox override is disabled', () => {
        const delegate = buildDelegate(true, false);
        const controller = new CheckboxInteractionController({} as never, delegate);
        const event = {
            preventDefault: vi.fn(),
            stopImmediatePropagation: vi.fn(),
        } as unknown as MouseEvent;

        controller.onDocumentClick(event);

        expect(delegate.updateUI).not.toHaveBeenCalled();
        expect(delegate.onCheckboxPress).not.toHaveBeenCalled();
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    });

    it('leaves clicks in non-daily views to Obsidian', () => {
        const delegate = buildDelegate(false);
        const controller = new CheckboxInteractionController({} as never, delegate);
        const event = {
            preventDefault: vi.fn(),
            stopImmediatePropagation: vi.fn(),
        } as unknown as MouseEvent;

        controller.onDocumentClick(event);

        expect(delegate.updateUI).toHaveBeenCalledOnce();
        expect(delegate.onCheckboxPress).not.toHaveBeenCalled();
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    });

    it('leaves modal clicks untouched even while a daily note is active', () => {
        class FakeElement {
            closest(selector: string): FakeElement | null {
                return selector === '.modal-container' ? this : null;
            }
        }

        vi.stubGlobal('Element', FakeElement);
        const delegate = buildDelegate(true);
        const controller = new CheckboxInteractionController({} as never, delegate);
        const event = {
            target: new FakeElement(),
            preventDefault: vi.fn(),
            stopImmediatePropagation: vi.fn(),
        } as unknown as MouseEvent;

        controller.onDocumentClick(event);

        expect(delegate.updateUI).not.toHaveBeenCalled();
        expect(delegate.onCheckboxPress).not.toHaveBeenCalled();
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    });

    it('intercepts a checkbox in a daily note and dispatches its resolved line', () => {
        vi.useFakeTimers();

        class FakeElement {
            closest(_selector: string): FakeElement | null {
                return null;
            }
        }

        class FakeCheckbox extends FakeElement {
            readonly blur = vi.fn();

            closest(selector: string): FakeElement | null {
                if (selector === '.cm-line, [data-line]') {
                    return {
                        getAttribute: (name: string) => name === 'data-line' ? '3' : null,
                    } as unknown as FakeElement;
                }
                if (selector.includes('.markdown-source-view')) return this;
                return null;
            }

            getBoundingClientRect(): DOMRect {
                return { left: 0, right: 20, top: 0, bottom: 20 } as DOMRect;
            }
        }

        const checkbox = new FakeCheckbox();
        vi.stubGlobal('Element', FakeElement);
        vi.stubGlobal('HTMLElement', FakeCheckbox);
        vi.stubGlobal('document', { elementFromPoint: vi.fn(() => checkbox) });
        vi.stubGlobal('window', { navigator: {} });

        const delegate = buildDelegate(true);
        const app = {
            workspace: {
                getActiveViewOfType: vi.fn(() => ({
                    editor: {},
                    contentEl: { contains: () => true },
                })),
            },
        };
        const controller = new CheckboxInteractionController(app as never, delegate);
        const event = {
            target: checkbox,
            clientX: 10,
            clientY: 10,
            preventDefault: vi.fn(),
            stopImmediatePropagation: vi.fn(),
        } as unknown as MouseEvent;

        controller.onDocumentClick(event);
        vi.runAllTimers();

        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
        expect(delegate.onCheckboxPress).toHaveBeenCalledWith('short', 3);
    });
});
