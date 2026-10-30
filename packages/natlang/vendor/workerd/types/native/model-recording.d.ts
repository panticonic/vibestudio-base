/**
 * Recording model turns for gradient replay (spec/NEURALESE_GRAPH.md, "Replay"; `natlang:learning`).
 *
 * A Neuralese-capable driver reports every exchange it makes to the active recorder: the request it sent (messages
 * with block parts, tools) and the assistant message the server returned (with block parts and the write records of
 * the blocks it wrote). The learning module installs the source of the active recorder (Node: `AsyncLocalStorage`),
 * so this module stays platform-neutral.
 */
export type NativeWriteOccurrence = {
    index: number;
    id: string;
    node: string;
};
export type NativeReadOccurrence = {
    index: number;
    id: string;
    source_state_id: string;
    node: string;
    source: string;
    stop_gradient?: true;
};
export type NativeTurnGraphBinding = {
    graph_turn: string;
    written_nodes: Record<string, string>;
    read_bindings: Record<string, string>;
    written_occurrences?: NativeWriteOccurrence[];
    read_occurrences?: NativeReadOccurrence[];
};
export type NativeRecordedTurn = {
    schema: 'natlang.native-recorded-turn/1';
    id: string;
    invocation_id?: string;
    retry: number;
    graph?: NativeTurnGraphBinding;
} & ({
    kind: 'generation';
    sampling: Record<string, unknown>;
} | {
    kind: 'decision';
    decision: Record<string, unknown>;
});
export type RecordedTurn = {
    readonly messages: unknown[];
    readonly tools?: unknown[];
    /** The assistant message as the server returned it: content and tool-call arguments may hold block parts. */
    readonly reply: Record<string, unknown>;
    /** Write records of the blocks this turn wrote. */
    readonly blocks: readonly Record<string, unknown>[];
    /** A decision readout instead of a generated reply: the options it scored (native/decision.ts). */
    readonly decision?: {
        readonly options: readonly string[];
    };
    /** Exact named native coefficient actors and scales active for this recorded turn. */
    readonly adapters?: readonly NativeAdapterBinding[];
    /** Explicit transport contract retained for exact native replay. */
    readonly native_state_modes?: Readonly<Record<string, 'same-base-adapter-state'>>;
    /** Exact native receipt and actual execution-graph occurrence binding. */
    readonly native?: NativeRecordedTurn;
};
/** A named native coefficient actor bound to a call, with its explicit scale. */
export type NativeAdapterBinding = {
    readonly id: string;
    readonly scale: number;
    readonly stop_gradient?: true;
};
/** A stored positional KV/hybrid-state value supplied as context to a model call. */
export type NativeStateBinding = {
    readonly id: string;
    readonly stop_gradient?: true;
    readonly source_occurrence?: string;
};
export interface TurnRecorder {
    record(turn: RecordedTurn): void;
    linkNativeTurn?(id: string, graphTurn: string): void;
    recordGraphNode?(event: Record<string, unknown>): void;
    nativeStateWriter?(id: string): string | undefined;
    /** Exact in-episode native writer nodes, including nested/child invocation traces. */
    nativeStateWriters?(id: string): readonly string[];
}
/** Install where the active recorder comes from (the learning module does this). */
export declare function setRecorderSource(next: () => TurnRecorder | undefined): void;
/** The recorder of the current asynchronous context, if any. */
export declare function activeRecorder(): TurnRecorder | undefined;
/** Install where the active nnt1 actor bindings come from. */
export declare function setNativeAdapterSource(next: () => readonly NativeAdapterBinding[] | undefined): void;
/** Install where active stored native-state context comes from. */
export declare function setNativeStateSource(next: () => readonly NativeStateBinding[] | undefined): void;
/** Install where the current invocation's tuned soft instruction/skill state IDs come from (the runtime does this). */
export declare function setLexicalSoftStateSource(next: () => readonly string[] | undefined): void;
/** Soft states the current invocation consumes: written by the exact base and read by its tuned stack, so their
 * consumption is the explicit same-base adapter-state exchange (plan §3.3). */
export declare function activeSoftStates(): readonly string[];
/** Install where the current invocation's lexical (tuned) weight stack comes from (the runtime does this). */
export declare function setLexicalNativeAdapterSource(next: () => readonly NativeAdapterBinding[] | undefined): void;
/**
 * Native coefficient actors active in the current asynchronous context: the invocation's lexical stack resolved from
 * its own binding, then explicit `withNativeAdapters` scopes in nesting order (plans/HIERARCHICAL_LORA_TUNING.md §6).
 */
export declare function activeNativeAdapters(): readonly NativeAdapterBinding[];
/** Stored positional state active in the current asynchronous context. */
export declare function activeNativeStates(): readonly NativeStateBinding[];
export declare class ModelTurnRecorder implements TurnRecorder {
    readonly turns: RecordedTurn[];
    /** Turns of outputs captured under their own recorder (function outputs): never claimed by an objective, but
     * producers of the gradient session like any other turn, so a downstream loss reaches their writes. */
    readonly nested: RecordedTurn[];
    private claimed;
    /** Objectives awaiting a promise output right now, and whether two of them overlapped (see `capture`). */
    active: number;
    overlapped: boolean;
    readonly graphNodes: Map<string, Record<string, unknown>>;
    readonly nativeLinks: Map<string, string>;
    private readonly graphConflicts;
    record(turn: RecordedTurn): void;
    recordGraphNode(event: Record<string, unknown>): void;
    nativeStateWriters(id: string): readonly string[];
    nativeStateWriter(id: string): string | undefined;
    linkNativeTurn(id: string, graphTurn: string): void;
    private bindNativeTurn;
    absorb(other: ModelTurnRecorder): void;
    nativeTurns(): RecordedTurn[];
    /** Turns recorded since the previous claim. */
    claim(): RecordedTurn[];
}
/** Exact capture/event matching; equal IDs do not select a latest writer. */
export declare function nativeCaptureGraphBinding(name: string, capture: Record<string, unknown>, nodes: ReadonlyMap<string, Record<string, unknown>>): NativeTurnGraphBinding;
