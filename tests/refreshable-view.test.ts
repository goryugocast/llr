import { describe, expect, it, vi } from 'vitest';
import { isRefreshableView } from '../src/view/refreshable-view';

describe('isRefreshableView', () => {
    it('accepts a view with a refresh method', () => {
        expect(isRefreshableView({ requestRefresh: vi.fn() })).toBe(true);
    });

    it.each([null, undefined, {}, { requestRefresh: true }])(
        'rejects a non-refreshable view: %s',
        (view) => {
            expect(isRefreshableView(view)).toBe(false);
        },
    );
});
