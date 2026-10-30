export declare const TRACE_VERSION = "reduction-trace/1";
export type TraceEvent = {
    version: typeof TRACE_VERSION;
    seq: number;
    kind: string;
    [key: string]: unknown;
};
export declare function deriveSeed(root: number, path: string, attempt: number, purpose: string, ordinal?: number): number;
export declare function changes(before: unknown, after: unknown, path?: (string | number)[]): Record<string, unknown>[];
export declare class NativeTraceRecorder {
    readonly events: TraceEvent[];
    private readonly started;
    constructor(manifest: Record<string, unknown>);
    /** Open a captured trace for read-only reconstruction and admission checks. */
    static fromEvents(events: Record<string, unknown>[]): NativeTraceRecorder;
    /** Sees each event as it is emitted (live observers); what it throws is ignored. */
    observer?: (event: TraceEvent) => void;
    emit(kind: string, data?: Record<string, unknown>): TraceEvent;
    finalState(): unknown;
    coverage(): Record<string, unknown>;
    replayObservations(): Record<string, unknown>;
    reconstruct(): unknown;
}
