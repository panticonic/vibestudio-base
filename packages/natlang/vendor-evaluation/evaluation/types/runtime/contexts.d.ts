import { neuraleseRef, type NeuraleseRef } from '../native/neuralese.js';
import type { NeuraleseStore } from '../native/neuralese-store.js';
import { type LoadedNz, type NzSoftFunctionSpec } from '../native/nz-file.js';
import { type Type } from '../native/types.js';
import { NATLANG_CALLABLE, type NatlangCallable } from './callable.js';
import { type CallableDefinition } from './kernel.js';
import { registerFileRecords, isFileRecord, type ItemRecord, type SourceFiles } from './loader.js';
export type ContextErrorCode = 'context-interface-mismatch' | 'context-new-executable' | 'context-conflict';
export declare class ContextError extends Error {
    readonly code: ContextErrorCode;
    constructor(code: ContextErrorCode, message: string);
}
export { registerFileRecords, isFileRecord };
declare const LIVE: unique symbol;
/** An explicit capture read at each call and written back after a successful eval (`nl.with({ n: live(n) })`). */
export type LiveCapture = {
    readonly [LIVE]: true;
    get(): unknown;
    set?(value: unknown): void;
};
/**
 * Mark an explicit capture as live. Host code passes a getter (and a setter for write-back).
 */
export declare function live(get: () => unknown, set?: (value: unknown) => void): LiveCapture;
/**
 * Mark an explicit capture of a let binding as live inside `nl.with({ n: live(n) })`: read at each call and written
 * back after a successful eval. The compiler lowers this form into the binding's accessors.
 * @natlangIntrinsic live
 */
export declare function live<T>(binding: T): T;
export declare const isLiveCapture: (value: unknown) => value is LiveCapture;
type SoftMeta = {
    type: string;
    body: string;
    bodyStopGradient?: true;
    bodySourceOccurrence?: string;
    captures: Record<string, unknown>;
    live: boolean;
};
/** The stored form of a soft function, when `value` is one. */
export declare function softFunctionOf(value: unknown): SoftMeta | undefined;
/**
 * A callable Neuralese function: its body is a soft block (shown to the model as a literal), its captures are explicit.
 * Plain capture values are snapshots; `live(...)` captures are read per call and written back. Its calls go only to
 * `context`, its definition site's context.
 */
export declare function softFunction(spec: {
    type: string;
    body: string | NeuraleseRef;
    captures?: Record<string, unknown>;
    context?: Context;
    /** Type aliases referenced by the callable signature and captured-value declarations. */
    types?: Record<string, string>;
    /** The callable items of a definition site that is not a context value (an eval scope's codebase). */
    codebase?: Record<string, unknown>;
    name?: string;
    /** Compiler attestations for a runtime-created soft function, carried into its invocation manifest. */
    manifest?: Record<string, unknown>;
    /** A pre-existing library operation does not consume a user-authored inline-nl layer. */
    adHoc?: boolean;
    /** `template`: answer by template readout (the first reply forced to return_result; the combinators use it). */
    readout?: 'template';
}): NatlangCallable;
/**
 * An immutable, content-addressed context. `items` are executable nodes (loader records, as a callable folder's
 * codebase); `data` maps names or slash-separated paths to data values.
 */
export declare class Context {
    #private;
    readonly items: Readonly<Record<string, ItemRecord>>;
    readonly id: string;
    private constructor();
    /** JSON data is immutable; binary and JSON values returned here are detached from the content-addressed snapshot. */
    get data(): Readonly<Record<string, unknown>>;
    static empty(): Context;
    /** A context over loader records. Every executable node must come from files. */
    static of(items: Record<string, ItemRecord>, data?: Record<string, unknown>): Context;
    /** The context a callable is bound to. */
    static ofCallable(fn: NatlangCallable): Context;
    /**
     * Load a callable folder as a context: its `.nl` and `.ts` items (registered as file nodes), each `.nz` file's
     * exports as data under the file's name, and other files (Markdown, JSON, text) as data under their relative paths.
     */
    static fromFolder(dir: string, files: SourceFiles & {
        readBytes?(path: string): Uint8Array;
    }, options?: {
        store?: NeuraleseStore;
    }): Promise<Context>;
    /** Executable node and data entry names. */
    get names(): string[];
    /**
     * A context with entries added or replaced. A natlang callable or loader record is an executable node and must come
     * from files; everything else (including soft functions, Neuralese values and contexts) is data. A context can be
     * stored as a data entry; the result has a new ID, so a context never contains itself.
     */
    with(entries: Record<string, unknown>): Context;
    /** Data entries removed. Executable nodes are removed with `pick`. */
    without(...keys: string[]): Context;
    /**
     * Replace an executable node with an edited definition. The edit is compiled and must keep the node's signature
     * (`context-interface-mismatch` otherwise). Edits of file nodes count as file nodes.
     */
    edit(name: string, text: string): Context;
    /** The sub-context of the named entries (an entry name, or a data path prefix such as `skills/sql`). */
    pick(...names: string[]): Context;
    /** The union of two contexts. An entry present in both must be the same entry (`context-conflict`). */
    union(other: Context): Context;
    /** Contexts reachable through data entries (for diagnostics; content addressing makes self-containment impossible). */
    contains(other: Context): boolean;
}
/**
 * The context interface of a definition: the items of its current context that its instructions (or the code of its
 * callable-folder modules) name, with their signatures.
 */
export declare function contextInterface(definition: CallableDefinition): Record<string, string>;
/** `fn.in(context)`: the same definition bound to another context, checked against its context interface. */
export declare function rebind(fn: NatlangCallable, context: Context): NatlangCallable;
/** A callable for a soft-function export. */
export declare function softFunctionFromSpec(spec: NzSoftFunctionSpec, context?: Context): NatlangCallable;
/** The exports of a loaded `.nz` file as runtime values (soft functions become callables). */
export declare function nzExports(loaded: LoadedNz, context?: Context): Record<string, unknown>;
/**
 * `save`: write values to `.nz` bytes. Exports are `{ type, value }`, or bare values whose type is inferred (Neuralese
 * values and soft functions carry their types). A soft function with live captures cannot be saved.
 */
export declare function save(exports: Record<string, unknown>, options: {
    store: NeuraleseStore;
    dialect: string;
    types?: string;
    skill?: import('../native/nz-file.js').NzSkill;
    provenance?: Record<string, unknown>;
}): Promise<Uint8Array>;
export { neuraleseRef, NATLANG_CALLABLE };
export type { Type };
