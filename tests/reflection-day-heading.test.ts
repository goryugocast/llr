// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createReflectionDayHeading } from '../src/view/reflection-day-heading';

describe('reflection day headings', () => {
    it('opens the heading date through a native keyboard-accessible button', () => {
        const openNote = vi.fn((_date: string) => {});
        const heading = createReflectionDayHeading({
            date: '2026-11-12', dateLabel: '11月12日（木）', isToday: false, openNote,
        });
        document.body.append(heading);
        const button = heading.querySelector('button')!;
        expect(heading.dataset.anchor).toBe('2026-11-12');
        expect(button.tagName).toBe('BUTTON');
        expect(button.type).toBe('button');
        expect(button.getAttribute('aria-label')).toBe('2026-11-12のデイリーノートを開く');
        button.focus();
        expect(document.activeElement).toBe(button);
        button.click();
        expect(openNote).toHaveBeenCalledWith('2026-11-12');
    });

    it('keeps missing or unavailable note headings plain without a creation action', () => {
        const heading = createReflectionDayHeading({
            date: '2026-11-11', dateLabel: '11月11日（水）', isToday: false,
        });
        expect(heading.dataset.anchor).toBe('2026-11-11');
        expect(heading.textContent).toBe('11月11日（水）');
        expect(heading.querySelector('button')).toBeNull();
    });
});
