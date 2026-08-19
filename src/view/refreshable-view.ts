export interface RefreshableView {
    requestRefresh(): Promise<void> | void;
}

/** View transitions can temporarily leave a non-summary view in a summary leaf. */
export function isRefreshableView(view: unknown): view is RefreshableView {
    if (typeof view !== 'object' || view === null) return false;
    return typeof Reflect.get(view, 'requestRefresh') === 'function';
}

/** Request a refresh only after confirming the leaf currently owns a compatible view. */
export function requestRefreshIfSupported(view: unknown): boolean {
    if (!isRefreshableView(view)) return false;
    void view.requestRefresh();
    return true;
}
