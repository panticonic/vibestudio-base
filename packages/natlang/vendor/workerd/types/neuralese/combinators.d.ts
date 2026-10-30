import { type NeuraleseRef } from '../native/neuralese.js';
import { type NeuraleseStore } from '../native/neuralese-store.js';
/** The combinators that have soft bodies, with their runtime signatures and the descriptions their bodies start from. */
export declare const COMBINATORS: {
    readonly map: {
        readonly type: "(v: Neuralese<unknown>, f: unknown) => Neuralese<unknown>";
        readonly text: "Apply the function f to the value that v holds, without reading v out first, and write the result as a new Neuralese value.";
    };
    readonly zip: {
        readonly type: "(a: Neuralese<unknown>, b: Neuralese<unknown>) => Neuralese<unknown>";
        readonly text: "Write one Neuralese value that holds the pair of the values a and b.";
    };
    readonly ap: {
        readonly type: "(f: Neuralese<unknown>, a: unknown) => Neuralese<unknown>";
        readonly text: "Apply the soft function f to the argument a and write the result as a Neuralese value instead of reading it out.";
    };
    readonly combine: {
        readonly type: "(vs: Neuralese<unknown>[]) => Neuralese<unknown>";
        readonly text: "Merge several views of the same kind of value into one Neuralese value that keeps what each of them holds.";
    };
    readonly split: {
        readonly type: "(v: Neuralese<unknown>) => unknown";
        readonly text: "Write one Neuralese value for each field of the record that v holds, as a record of Neuralese values.";
    };
    readonly splitList: {
        readonly type: "(v: Neuralese<unknown>) => Neuralese<unknown>[]";
        readonly text: "Write one Neuralese value for each element of the list that v holds, in order.";
    };
    readonly read: {
        readonly type: "(v: Neuralese<unknown>) => unknown";
        readonly text: "Read the value that v holds and return it exactly, as an ordinary value of its declared type.";
    };
    readonly convert: {
        readonly type: "(v: Neuralese<unknown>, dialect: string) => Neuralese<unknown>";
        readonly text: "Write the value that v holds again, as a Neuralese value in the named dialect.";
    };
    readonly gloss: {
        readonly type: "(v: Neuralese<unknown>) => string";
        readonly text: "Describe in plain words, for a person, what the value v holds. This is a diagnostic rendering, not the value.";
    };
};
export type CombinatorName = keyof typeof COMBINATORS;
export type TextReadSource = {
    schema: 'natlang.text-read-source/1';
    export: 'read';
    bodyId: string;
    type: string;
    source: string;
    sourceSha256: string;
    learnedVectors: false;
};
export type StandardLibrary = {
    dialect: string;
    width: number;
    bodies: Record<CombinatorName, string>;
    emptyState?: string;
    /** Explicit provider-text implementation of the read instruction; it does not claim learned-vector semantics. */
    textReadSource?: TextReadSource;
};
/**
 * Initialize every combinator body in context from its description on a native-state server and return the library and
 * its typed `.nz` bytes. On Node, `buildStandardLibrary` from `@natlang/node`
 * (neuralese/node-files.ts) also writes them to `path`. Each body keeps its exact native source capture and text digest
 * in archive provenance.
 */
export declare function buildStandardLibrary(options: {
    endpoint: string;
    headers?: Record<string, string>;
    store?: NeuraleseStore;
    textProviderRead?: boolean;
    platform: import('../runtime/platform.js').Platform;
}): Promise<{
    library: StandardLibrary;
    bytes: Uint8Array;
}>;
/**
 * Read a standard-library `.nz` file from its bytes, registering its blocks in `store`. On Node, `loadStandardLibrary`
 * from `@natlang/node` (neuralese/node-files.ts) also takes a path.
 */
export declare function loadStandardLibrary(bytes: Uint8Array, store?: NeuraleseStore): Promise<StandardLibrary>;
/** The combinators over a standard library. */
export declare function createNeuraleseLibrary(library: StandardLibrary): {
    map: (v: NeuraleseRef, f: unknown) => Promise<unknown>;
    zip: (a: NeuraleseRef, b: NeuraleseRef) => Promise<unknown>;
    ap: (f: NeuraleseRef, a: unknown) => Promise<unknown>;
    combine: (...vs: NeuraleseRef[]) => Promise<unknown>;
    /** The zero-length value: the identity of `combine`. */
    empty: () => NeuraleseRef;
    split: (v: NeuraleseRef) => Promise<unknown>;
    splitList: (v: NeuraleseRef) => Promise<unknown>;
    /** Typed readout; an ordinary string is already its own crisp value. */
    read(v: NeuraleseRef | string): Promise<unknown>;
    convert: (v: NeuraleseRef, dialect: string) => Promise<unknown>;
    /**
     * Function composition, the right side of map fusion (`map(map(v, g), f)` becomes `map(v, compose(f, g))`,
     * compiler/rewrites.ts): `f` applied to what `g` returns. It is exact and makes no model call itself, so the
     * rewrite saves one `map` without changing what each step computes.
     */
    compose<A, B, C>(f: (b: B) => C | Promise<C>, g: (a: A) => B | Promise<B>): (a: A) => Promise<C>;
    gloss: (v: NeuraleseRef) => Promise<string>;
    /**
     * The query operator: the answer to `question` from what `v` holds, by its definition `read(map(v, question))`:
     * `map` writes the answer as a `Neuralese<string>` and `read` reads it out. Its law (S0 §4.2) is its target:
     * answering from the block matches answering from the full text.
     */
    ask(v: NeuraleseRef, question: string): Promise<string>;
};
/** Raised when source-level text conversion has no typed readout available in this task. */
export declare class NeuraleseReadoutCapabilityError extends Error {
    readonly code = "neuralese-readout-unavailable";
    readonly capability = "typed-readout";
    constructor(detail?: string);
}
/** Compiler and eval `read(value)` plus JavaScript text coercion delegate to this typed readout. */
export declare function readNeuraleseForCurrentTask(value: unknown): Promise<unknown>;
/** The `natlang:neuralese` module: bound to the current task's `neuralese` service (a `StandardLibrary`). */
export declare const neuraleseModule: Record<string, unknown>;
