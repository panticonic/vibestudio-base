/** Explicit full-payload capture, independent of truncated interpreter previews. */
export declare class FixtureObservationStore {
    private readonly values;
    put(key: string, value: unknown): void;
    get(key: string): unknown;
    snapshot(): Readonly<Record<string, unknown>>;
}
