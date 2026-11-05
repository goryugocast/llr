/** Tracks the open state of reflection sections by stable view key. */
export class ReflectionExpansionState {
    constructor(private defaultOpen = false) {}
    private readonly overrides = new Map<string, boolean>();

    isOpen(key: string): boolean {
        return this.overrides.get(key) ?? this.defaultOpen;
    }

    setOpen(key: string, open: boolean): void {
        this.overrides.set(key, open);
    }

    setAll(open: boolean): void {
        this.defaultOpen = open;
        this.overrides.clear();
    }

    shouldOpenAll(keys: readonly string[]): boolean {
        return keys.some(key => !this.isOpen(key));
    }
}
