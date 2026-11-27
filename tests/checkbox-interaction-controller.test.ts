import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';
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
        Platform.isMobile = false;
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

    it('does not intercept an Obsidian property checkbox', () => {
        class FakeElement {
            closest(selector: string): FakeElement | null {
                if (selector.includes('.metadata-container')) return this;
                // This is an ordinary input checkbox, not a Markdown task.
                if (selector.includes('input[type="checkbox"]')) return this;
                return null;
            }
        }

        const property = new FakeElement();
        vi.stubGlobal('Element', FakeElement);
        vi.stubGlobal('HTMLElement', FakeElement);
        vi.stubGlobal('document', { elementFromPoint: vi.fn(() => property) });

        const delegate = buildDelegate(true);
        const app = { workspace: { getActiveViewOfType: vi.fn() } };
        const controller = new CheckboxInteractionController(app as never, delegate);
        const event = {
            target: property,
            clientX: 10,
            clientY: 10,
            preventDefault: vi.fn(),
            stopImmediatePropagation: vi.fn(),
        } as unknown as MouseEvent;

        controller.onDocumentClick(event);

        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
        expect(delegate.onCheckboxPress).not.toHaveBeenCalled();
        expect(app.workspace.getActiveViewOfType).not.toHaveBeenCalled();
    });

    it('never dispatches a task action when a checkbox resolves to a frontmatter line', () => {
        class FakeElement {
            closest(_selector: string): FakeElement | null { return null; }
        }
        class FakeCheckbox extends FakeElement {
            closest(selector: string): FakeElement | null {
                if (selector === '.cm-line, [data-line]') {
                    return { getAttribute: (name: string) => name === 'data-line' ? '0' : null } as unknown as FakeElement;
                }
                if (selector.includes('.task-list-item-checkbox')) return this;
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
        const delegate = buildDelegate(true);
        const app = { workspace: { getActiveViewOfType: vi.fn(() => ({
            editor: { getLine: () => '---' },
            contentEl: { contains: () => true },
        })) } };
        const controller = new CheckboxInteractionController(app as never, delegate);
        const event = {
            target: checkbox,
            clientX: 10, clientY: 10,
            preventDefault: vi.fn(),
            stopImmediatePropagation: vi.fn(),
        } as unknown as MouseEvent;

        controller.onDocumentClick(event);

        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
        expect(delegate.onCheckboxPress).not.toHaveBeenCalled();
    });

    it.each([
        { scenario: 'desktop click on the checkbox', mobile: false },
        { scenario: 'mobile click delivered to the checkbox with coordinates over nearby text', mobile: true },
    ])('intercepts a $scenario and dispatches its resolved line once', ({ mobile }) => {
        vi.useFakeTimers();
        Platform.isMobile = mobile;

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
                if (selector.includes('.task-list-item-checkbox')) return this;
                return null;
            }

            getBoundingClientRect(): DOMRect {
                return { left: 0, right: 20, top: 0, bottom: 20 } as DOMRect;
            }
        }

        const checkbox = new FakeCheckbox();
        vi.stubGlobal('Element', FakeElement);
        vi.stubGlobal('HTMLElement', FakeCheckbox);
        vi.stubGlobal('document', { elementFromPoint: vi.fn(() => mobile ? new FakeElement() : checkbox) });
        vi.stubGlobal('window', { navigator: {} });

        const delegate = buildDelegate(true);
        const app = {
            workspace: {
                getActiveViewOfType: vi.fn(() => ({
                    editor: { getLine: () => '- [ ] test task' },
                    contentEl: { contains: () => true },
                })),
            },
        };
        const controller = new CheckboxInteractionController(app as never, delegate);
        const event = {
            target: checkbox,
            clientX: mobile ? 30 : 10,
            clientY: 10,
            preventDefault: vi.fn(),
            stopImmediatePropagation: vi.fn(),
        } as unknown as MouseEvent;

        controller.onDocumentClick(event);
        vi.runAllTimers();

        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
        expect(delegate.onCheckboxPress).toHaveBeenCalledOnce();
        expect(delegate.onCheckboxPress).toHaveBeenCalledWith('short', 3);
    });
});
