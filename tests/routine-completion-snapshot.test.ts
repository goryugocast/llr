import { describe, it, expect, vi } from 'vitest';
import { buildRoutineCompletionSignature } from '../src/service/routine-completion-snapshot';

vi.mock('obsidian', () => ({
    App: class {},
    TFile: class {},
    MarkdownView: class {},
}));

describe('buildRoutineCompletionSignature', () => {
    it('combines line number and trimmed text', () => {
        expect(buildRoutineCompletionSignature(5, '- [x] [[朝の仕込み]]'))
            .toBe('5:- [x] [[朝の仕込み]]');
    });

    it('trims whitespace from the line text', () => {
        expect(buildRoutineCompletionSignature(10, '  - [x] task  '))
            .toBe('10:- [x] task');
    });

    it('uses __completed__ sentinel for empty line text', () => {
        expect(buildRoutineCompletionSignature(0, '')).toBe('0:__completed__');
    });

    it('uses __completed__ sentinel for whitespace-only line text', () => {
        expect(buildRoutineCompletionSignature(3, '   ')).toBe('3:__completed__');
    });

    it('handles line number 0', () => {
        expect(buildRoutineCompletionSignature(0, 'text')).toBe('0:text');
    });

    it('handles large line numbers', () => {
        expect(buildRoutineCompletionSignature(9999, 'content'))
            .toBe('9999:content');
    });
});
