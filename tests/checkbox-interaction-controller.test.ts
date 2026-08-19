import { describe, expect, it, vi } from 'vitest';
import { CheckboxInteractionController, type CheckboxInteractionDelegate } from '../src/view/checkbox-interaction-controller';

vi.mock('obsidian', () => ({
    App: class {},
    MarkdownView: class {},
    Platform: { isMobile: false },
}));

function buildDelegate(isEditableMarkdownView: boolean): CheckboxInteractionDelegate {
    return {
        isOverrideEnabled: () => true,
        isEditableMarkdownView: () => isEditableMarkdownView,
        getLineStateLabel: () => 'unstarted',
        onCheckboxPress: vi.fn(),
        debugLog: vi.fn(),
        updateUI: vi.fn(),
    };
}

describe('CheckboxInteractionController', () => {
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
});
