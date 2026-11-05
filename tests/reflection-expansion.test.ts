import { describe, expect, it } from 'vitest';
import { ReflectionExpansionState } from '../src/service/reflection-expansion';

describe('ReflectionExpansionState', () => {
    it('can start with visible memos while retaining individual and global overrides', () => {
        const state = new ReflectionExpansionState(true);
        expect(state.isOpen('first')).toBe(true);
        state.setOpen('first', false);
        expect(state.isOpen('first')).toBe(false);
        expect(state.isOpen('later')).toBe(true);
        state.setAll(false);
        expect(state.isOpen('later')).toBe(false);
    });

    it('starts closed and uses an all-open default for current and future keys', () => {
        const state = new ReflectionExpansionState();

        expect(state.isOpen('first')).toBe(false);
        state.setAll(true);
        expect(state.isOpen('first')).toBe(true);
        expect(state.isOpen('later')).toBe(true);
    });

    it('detects any closed key and resets individual exceptions when setting all open', () => {
        const state = new ReflectionExpansionState();
        state.setAll(true);
        state.setOpen('closed', false);

        expect(state.isOpen('closed')).toBe(false);
        expect(state.shouldOpenAll(['open', 'closed'])).toBe(true);
        state.setAll(true);
        expect(state.isOpen('closed')).toBe(true);
        expect(state.shouldOpenAll(['open', 'closed'])).toBe(false);
    });

    it('sets the default closed and closes keys added later', () => {
        const state = new ReflectionExpansionState();
        state.setAll(false);

        expect(state.isOpen('later')).toBe(false);
        expect(state.shouldOpenAll(['later'])).toBe(true);
    });

    it('keeps independent individual opens under the closed default', () => {
        const state = new ReflectionExpansionState();
        state.setOpen('first', true);
        state.setOpen('second', true);

        expect(state.isOpen('first')).toBe(true);
        expect(state.isOpen('second')).toBe(true);
        expect(state.isOpen('other')).toBe(false);
        expect(state.shouldOpenAll(['first', 'second'])).toBe(false);
    });

    it('does not offer an all-open action for an empty key list', () => {
        const state = new ReflectionExpansionState();

        expect(state.shouldOpenAll([])).toBe(false);
    });

    it('detects mixed states', () => {
        const state = new ReflectionExpansionState();
        state.setOpen('open', true);

        expect(state.shouldOpenAll(['open', 'closed'])).toBe(true);
    });
});
