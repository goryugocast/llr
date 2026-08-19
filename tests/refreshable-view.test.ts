import { describe, expect, it, vi } from 'vitest';
import { isRefreshableView, requestRefreshIfSupported } from '../src/view/refreshable-view';

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

    it('requests one refresh from a compatible view', () => {
        const requestRefresh = vi.fn();

        expect(requestRefreshIfSupported({ requestRefresh })).toBe(true);
        expect(requestRefresh).toHaveBeenCalledOnce();
    });

    it.each([null, {}, { requestRefresh: 'not a function' }])(
        'ignores an incompatible leaf view without throwing: %s',
        (view) => {
            expect(() => requestRefreshIfSupported(view)).not.toThrow();
            expect(requestRefreshIfSupported(view)).toBe(false);
        },
    );
});
