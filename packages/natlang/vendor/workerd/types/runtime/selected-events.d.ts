export type SelectedEvent<T> = Readonly<{
    source: string;
    id: string;
    position: number;
    value: T;
}>;
export type EventReceipt = Readonly<{
    source: string;
    id?: string;
    position?: number;
    disposition: 'buffered' | 'delivered' | 'duplicate' | 'overflow' | 'closed' | 'failed' | 'cancelled';
}>;
export type EventQueueSnapshot<T> = {
    schema: 'natlang-event-queue/1';
    source: string;
    capacity: number;
    historyCapacity: number;
    nextPosition: number;
    state: 'open' | 'closed';
    buffered: SelectedEvent<T>[];
    seen: [string, {
        position: number;
        digest: string;
    }][];
};
export declare class SelectedEventQueue<T> implements AsyncIterableIterator<SelectedEvent<T>> {
    readonly source: string;
    readonly capacity: number;
    private readonly receipt;
    readonly historyCapacity: number;
    private readonly buffered;
    private readonly seen;
    private readonly space;
    private waiting?;
    private state;
    private failure?;
    private receiptFailed;
    private position;
    constructor(source: string, capacity: number, receipt?: (receipt: EventReceipt) => void, historyCapacity?: number);
    [Symbol.asyncIterator](): AsyncIterableIterator<SelectedEvent<T>>;
    get pending(): number;
    get status(): string;
    private emit;
    private open;
    /** A pausable source awaits admission. Concurrent producers remain bounded. */
    push(id: string, value: T): Promise<EventReceipt>;
    /** A source that cannot pause gets an explicit overflow disposition. */
    post(id: string, value: T): EventReceipt;
    next(): Promise<IteratorResult<SelectedEvent<T>>>;
    close(): void;
    fail(error: unknown): void;
    cancel(error?: unknown): void;
    private stop;
    return(): Promise<IteratorResult<SelectedEvent<T>>>;
    checkpoint(): EventQueueSnapshot<T>;
    static restore<T>(snapshot: EventQueueSnapshot<T>, receipt?: (receipt: EventReceipt) => void): SelectedEventQueue<T>;
}
/** Each selected callback completes before the next event is consumed. */
export declare function foldSelectedEvents<T, S>(source: AsyncIterable<SelectedEvent<T>>, initial: S, step: (state: S, value: T, event: SelectedEvent<T>) => Promise<S> | S): Promise<S>;
/** Bounded independent execution with input-order results and source identity.
 * Completed later items occupy the same bounded window until earlier work ends. */
export declare function mapSelectedEvents<T, R>(source: AsyncIterable<SelectedEvent<T>>, select: (value: T, event: SelectedEvent<T>, signal: AbortSignal) => Promise<R> | R, concurrency: number): AsyncGenerator<SelectedEvent<R>>;
