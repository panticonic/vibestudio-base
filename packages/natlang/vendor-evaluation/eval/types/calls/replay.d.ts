import type { NatlangRuntime } from '../runtime/runtime.js';
import type { CallRecord, ValueRef } from './types.js';
/** What a replay needs of the store. */
export interface ValueSource {
    value(ref: ValueRef | null | undefined): unknown;
    call(callId: string): CallRecord | undefined;
    children(callId: string): {
        call_id: string;
    }[];
}
export declare class ReplayDivergence extends Error {
    constructor(message: string);
}
/** One recorded service call, with its values loaded. */
export type RecordedEffect = {
    service: string;
    method: string;
    args: unknown;
    result?: unknown;
    async: boolean;
    error?: string;
    complete: boolean;
};
/** A service call as made during a replay. */
export type ObservedEffect = {
    service: string;
    method: string;
    args: unknown;
};
/** Deep equality of JSON data, ignoring key order. */
export declare const sameData: (left: unknown, right: unknown) => boolean;
/** Gather the complete recorded subtree and reconstruct only authenticated request chronology. */
export declare function subtreeEffects(store: ValueSource, record: CallRecord): RecordedEffect[];
/** Explicit, source-bound claim that independent exact lookup is valid for these methods. */
export type IndependentReplayContract = {
    schema: 'natlang.independent-service-replay/1';
    semantics: 'stateless-independent';
    methods: string[];
    effects_sha256: string;
    sha256: string;
};
/** Services that answer from recorded effects. Each recorded effect answers at most one call. */
export declare class ReplayServices {
    readonly effects: readonly RecordedEffect[];
    private readonly options;
    readonly services: Record<string, object>;
    readonly observed: ObservedEffect[];
    readonly divergences: string[];
    private readonly used;
    constructor(effects: readonly RecordedEffect[], names?: readonly string[], options?: {
        mode?: 'ordered-exact' | 'independent-exact';
        contract?: IndependentReplayContract;
    });
    private answer;
    /** Recorded effects no replayed call used. */
    unused(): RecordedEffect[];
}
/** The inputs of a recorded call as host values, with a folder rebuilt in memory. `undefined` when one is incomplete. */
export declare function recordedArguments(store: ValueSource, record: CallRecord): Record<string, unknown> | undefined;
/** What a replayed run did. */
export type ReplayOutcome = {
    value?: unknown;
    error?: string;
    observed: ObservedEffect[];
    divergences: string[];
    captureWrites: Record<string, unknown>;
    files?: {
        path: string;
        kind: string;
        text?: string;
    }[];
};
/**
 * Run `run(args)` against recorded effects in a task of `runtime` whose services are the replay services; natural-language
 * calls it makes run live (on the runtime's model) under the same services, with compilations off.
 */
export declare function replay(runtime: NatlangRuntime, run: (args: Record<string, unknown>) => unknown, args: Record<string, unknown>, effects: readonly RecordedEffect[], options?: {
    serviceNames?: string[];
    captureNames?: string[];
    replayMode?: 'ordered-exact' | 'independent-exact';
    contract?: IndependentReplayContract;
    taskOptions?: {
        auditOf?: string;
        name?: string;
    };
}): Promise<ReplayOutcome>;
