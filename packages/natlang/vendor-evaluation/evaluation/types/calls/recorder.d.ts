import { type CallRecord, type CallStoreSettings, type CaseStats, type CompilationRow, type DefinitionIdentity, type EffectRecord, type ExecutorKind, type FolderRecord, type ValueRef } from './types.js';
/** What the runtime needs of a call store. `CallStore` (Node) implements it; tests may pass their own. */
export interface CallStoreLike {
    settings(): CallStoreSettings;
    record(record: CallRecord, blobs: ReadonlyMap<string, string>, events?: string): void;
    /** Note that a call started (shown as running until its record arrives). */
    begin?(row: Parameters<import('./store.js').CallStore['begin']>[0]): void;
    /** The trace events so far of a running call. */
    progress?(callId: string, events: string): void;
    version(): number;
    currentCompilation(definitionKey: string): (CompilationRow & {
        cases: CaseStats[];
    }) | undefined;
    caseServed(caseHash: string, callId: string, handedOff: boolean): void;
    enqueue(kind: 'audit' | 'shadow', caseHash: string, callId: string): void;
    /** Attach independent evidence to a recorded call (an evaluation score, a judge's verdict, user feedback). */
    annotate?(callId: string, kind: string, value: unknown, source?: string, pin?: boolean): void;
    /** Drop the row of a call that started and will not be recorded (a tier attempt that declined before running). */
    discard?(callId: string): void;
    /** Iteration statistics kept with the machine's records, so iterateOn sites learn across processes. */
    iterationStatistics?(): import('../runtime/iterate.js').IterationStatisticsStore;
    /** Refinement verdicts kept with the machine's records (native/refinement.ts `VerdictCache`). */
    refinementVerdicts?(): import('../native/refinement.js').VerdictCache;
}
/** Report a store failure once per store; recording must not fail calls. */
export declare function reportStoreFailure(store: object, error: unknown): void;
/** The revision key compilations are stored under: what ran, as run (instructions and contract). */
export declare function definitionKey(definition: {
    id: string;
    body: string;
    params: unknown;
    returns: string;
    types: unknown;
    subtype: string;
    readout?: string;
    declaredParameters?: true;
}): string;
/** The hash of a context's interface: what a case may call, by name, kind and revision. */
export declare function interfaceHash(codebase: Record<string, unknown>): string;
/** Exclusion patterns from `recording.exclude`: a definition source glob, or `definitionName.argument`. */
export declare function excluded(patterns: readonly string[] | undefined, definition: {
    name: string;
    source: string | null;
}, argument?: string): boolean;
/** The record of one running call. */
export declare class CallCapture {
    readonly store: CallStoreLike;
    readonly settings: CallStoreSettings;
    readonly base: {
        callId: string;
        parentCallId: string | null;
        parentActionIndex: number | null;
        taskId: string;
        programId: string | null;
        /** A root run's logical name (several runs share it; each has its own call ID). */
        runLabel?: string | null;
        buildHash: string | null;
        programRoot: string | null;
        definition: DefinitionIdentity;
        model: {
            id: string | null;
            revision: string | null;
        };
        exclude?: readonly string[];
    };
    readonly blobs: Map<string, string>;
    readonly effects: EffectRecord[];
    private readonly pending;
    private order;
    private readonly started;
    private readonly startedAt;
    inputs: Record<string, ValueRef>;
    captures: Record<string, ValueRef>;
    captureWrites: {
        name: string;
        after: ValueRef;
    }[];
    features: Record<string, string | number | boolean>;
    /** Exact host inputs by name, for features and dispatch. */
    hostInputs: Record<string, unknown>;
    executor: CallRecord['executor'];
    auditOf: string | null;
    folder: FolderRecord | null;
    constructor(store: CallStoreLike, settings: CallStoreSettings, base: {
        callId: string;
        parentCallId: string | null;
        parentActionIndex: number | null;
        taskId: string;
        programId: string | null;
        /** A root run's logical name (several runs share it; each has its own call ID). */
        runLabel?: string | null;
        buildHash: string | null;
        programRoot: string | null;
        definition: DefinitionIdentity;
        model: {
            id: string | null;
            revision: string | null;
        };
        exclude?: readonly string[];
    });
    /** Tell the store the call is running. */
    announce(): void;
    /** The call ends without a record: its row of a running call is removed (a strict tier attempt that declined). */
    discard(): void;
    private watcher?;
    /** While the call runs, write its trace events so far every `intervalMs`, so a long call can be inspected live. */
    watch(events: () => readonly Record<string, unknown>[], intervalMs?: number): void;
    /** Snapshot a value into this record's blobs. */
    ref(value: unknown, excludedValue?: boolean): ValueRef;
    setInputs(values: Record<string, unknown>, captures?: Record<string, unknown>): void;
    /**
     * A directory reducer's folder as it was when the call started: each file's text by hash, so a replay can rebuild it.
     * A folder larger than sixteen value bounds is recorded by its listing only.
     */
    setFolderInput(folder: {
        listFiles(path?: string): {
            path: string;
            bytes: number;
        }[];
        readBytesSync(path: string): Uint8Array;
    }): void;
    /** One recording-services event (`native/effects.ts`), with its exact arguments and result. */
    effect(event: {
        phase: 'requested' | 'completed' | 'failed';
        service: string;
        method: string;
        exact?: {
            args?: unknown[];
            result?: unknown;
            async?: boolean;
        };
        error?: string;
        seq?: number;
    }, by?: 'agent' | 'crisp'): void;
    /** Effects that completed so far, in the order they started. */
    completedEffects(by?: 'agent' | 'crisp'): EffectRecord[];
    /** Write the record. Never throws. */
    finish(result: {
        outcome: string;
        detail: string;
        output?: unknown;
        hasOutput: boolean;
        events: readonly Record<string, unknown>[];
    }): CallRecord | undefined;
}
export type { ExecutorKind };
