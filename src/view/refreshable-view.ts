export interface RefreshableView {
    requestRefresh(): Promise<void> | void;
}

/** View transitions can temporarily leave a non-summary view in a summary leaf. */
export function isRefreshableView(view: unknown): view is RefreshableView {
    if (typeof view !== 'object' || view === null) return false;
    return typeof Reflect.get(view, 'requestRefresh') === 'function';
}
