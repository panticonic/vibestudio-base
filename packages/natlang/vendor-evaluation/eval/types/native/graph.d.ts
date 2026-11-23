import type { NativeTraceRecorder, TraceEvent } from './trace.js';
export declare const GRAPH_VERSION = "natlang.exec-graph/1";
export declare const GRAPH_NODE_KINDS: readonly ["invocation", "context_bind", "model_turn", "block_write", "block_read", "readout", "combinator", "rewrite", "effect", "iteration_step", "literal"];
export type GraphNodeKind = typeof GRAPH_NODE_KINDS[number];
export type GraphInput = {
    node: string;
    port?: string;
    block?: string;
    source?: string;
    stop?: boolean;
};
/** Manifest additions of a graph record. */
export type GraphManifest = {
    version: typeof GRAPH_VERSION;
    model: {
        id: string | null;
        revision: string | null;
    };
    dialect: string | null;
    rewrites: string[];
    root_context: string;
    seeds: Record<string, unknown>;
};
export declare function graphManifest(options: {
    model?: {
        id?: string | null;
        revision?: string | null;
    };
    dialect?: string | null;
    rewrites?: readonly string[];
    rootContext?: string;
    seeds?: Record<string, unknown>;
}): GraphManifest;
/** The context of a definition used where it was loaded (its own files), when it was not rebound. */
export declare const FILE_CONTEXT = "ctx:files";
export declare const invocationNodeId: (callId: string) => string;
export declare function bindTraceScope(trace: NativeTraceRecorder, scope: object): void;
export declare function registerTrace(callId: string, trace: NativeTraceRecorder, scope?: object): void;
/** Scope used for block provenance emitted by this trace. Traces without an explicitly bound scope are isolated to themselves. */
export declare function producerScopeForTrace(trace: NativeTraceRecorder | undefined): object | undefined;
export declare function releaseTrace(callId: string): void;
export declare const traceFor: (callId: string | undefined) => NativeTraceRecorder | undefined;
/** Whether this exact occurrence was observed writing this block in the same task scope. */
export declare function hasProducerOccurrence(block: string, node: string, scope: object): boolean;
/** Authenticated writers in this task's scope; never consult another task's index. */
export declare function producerOccurrences(block: string, scope: object | undefined): string[];
/** An input edge for a block: from its producing node, or from `external` (a file, another task, an older record). */
export declare function blockInput(block: string, port?: string, sourceOccurrence?: string, scope?: object): GraphInput;
/** Block inputs for every soft value inside `value`, with ports naming where each one sits. */
export declare function valueInputs(value: unknown, port: string, scope?: object): GraphInput[];
/**
 * Emit a node into `trace`. With `event`, the node is that trace kind (an existing event kind such as `invocation` or
 * `effect` becomes a node by carrying a node ID); the node's ID is returned.
 */
export declare function graphNode(trace: NativeTraceRecorder | undefined, kind: GraphNodeKind, data: Record<string, unknown>, inputs?: readonly GraphInput[], id?: string): string | undefined;
/** The subset of JSON Schema (2020-12) the graph schema uses. */
type Schema = {
    type?: string | string[];
    required?: string[];
    properties?: Record<string, Schema>;
    enum?: unknown[];
    const?: unknown;
    items?: Schema;
    minItems?: number;
    maxItems?: number;
    minimum?: number;
    maximum?: number;
    pattern?: string;
    additionalProperties?: boolean | Schema;
    allOf?: Schema[];
    if?: Schema;
    then?: Schema;
    $ref?: string;
    $defs?: Record<string, Schema>;
};
/** Validate `value` against `schema`; returns error messages with JSON-pointer-like paths. */
export declare function validateSchema(schema: Schema, value: unknown, root?: Schema, path?: string): string[];
/**
 * Check a record's node events: each validates against the graph schema, node IDs are unique, and every input refers
 * to a node seen earlier in the given events, to `external`, or to a node of another call (`call:` or `<call>#<seq>`).
 */
export declare function validateGraph(events: readonly (TraceEvent | Record<string, unknown>)[], schema: Schema): {
    node: string;
    errors: string[];
}[];
export {};
