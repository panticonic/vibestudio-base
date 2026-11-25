import { type Frame } from './context.js';
import { type CallableDefinition, type CaptureCell, type Instantiation } from './kernel.js';
import { type Representation } from '../native/representation.js';
import { type ItemRecord, type NatlangRecord } from './loader.js';
import type { Platform } from './platform.js';
import { type FunctionSignature } from '../native/types.js';
export declare const NATLANG_CALLABLE: unique symbol;
export type CallableMeta = {
    definition: CallableDefinition;
    kind: 'named' | 'inline';
    /** Lexical creation frame of an inline callable; ambient calls cannot replace its authority. */
    created?: Frame;
    /** Lexical task and capability owner; dynamic caller ancestry is resolved for each invocation. */
    bound?: Frame;
    /** Capture cells an inline or soft function was created with, kept so rebinding preserves them. */
    captures?: Record<string, CaptureCell>;
    /** Invocation options other than captures (manifest, classes), kept for rebinding. */
    options?: import('./kernel.js').InvokeOptions;
    /** Instructions of an inline function, rendered per call; kept for rebinding. */
    instructions?: string | ((frame: Frame) => string);
    /** A compiler-owned inline `nl` recipe. Only these generated callables support `.with(record)`. */
    rebindInline?: (captures: Record<string, unknown>, origin?: import('./lowered.js').InlineInstructionOrigin, sources?: Record<string, 'input' | 'local' | 'block' | 'handle'>) => NatlangCallable;
    /** Run a call; `at` is the representation its result is used as (a compiled call site's, or a host's `invokeAt`). */
    invoke(args: unknown[], frame: Frame, at?: Instantiation, folder?: import('./kernel.js').InvokeOptions['folder']): Promise<unknown>;
    /** `fn.in(context)` for a callable derived from another (`partial`): the derivation applied to the rebound original. */
    inContext?: (context: unknown) => NatlangCallable;
};
/**
 * Installed by runtime/contexts.ts: `fn.in(context)`. Kept on a global symbol, not a module binding: contexts.ts and
 * this module import each other through the kernel, and either may finish loading first (no module bindings, no TDZ).
 */
type Rebinder = (fn: NatlangCallable, context: unknown) => NatlangCallable;
export declare function setRebinder(next: Rebinder): void;
/**
 * Installed by runtime/contexts.ts: scope cells for a record's default-bound data entries (`.nz` files of its companion
 * folder), with soft-function exports as callables. Same global-symbol arrangement as the rebinder.
 */
type DataCells = (data: Record<string, unknown>) => {
    captures: Record<string, CaptureCell>;
    skillFiles?: Record<string, string | Uint8Array>;
};
export declare function setDataCells(next: DataCells): void;
export declare function recordOf(fn: unknown): ItemRecord | undefined;
export declare function rememberRecord(fn: object, record: ItemRecord): void;
export type NatlangCallable = ((...args: unknown[]) => Promise<unknown>) & {
    readonly [NATLANG_CALLABLE]: CallableMeta;
};
export declare function isNatlangCallable(value: unknown): value is NatlangCallable;
export declare function callableMeta(value: unknown): CallableMeta | undefined;
/** Define a read-only child attribute, rejecting names that collide with function internals. */
export declare function defineChild(target: object, name: string, value: unknown): void;
/**
 * Call a natlang function with its result at `representation` (DECISIONS.md 2026-10-09): `{ kind: "crisp" }` runs a
 * representation-generic result's crisp instance, `{ kind: "neuralese" }` its Neuralese instance as a template write.
 * Compiled call sites pass the instance their expected type picks; hosts use this to run a stored call for the
 * reader that consumes it. A function without a generic result runs only at the representation it declares.
 */
export declare function invokeAt(fn: unknown, args: readonly unknown[], representation: Representation, site?: string): Promise<unknown>;
/**
 * The checked signature of a definition (native/types.ts NATLANG_SIGNATURE): its parameter and result types with the
 * aliases they name. Undefined for an inline function that takes whatever each call passes, or a type text that does not
 * parse (the call reports that).
 */
export declare function definitionSignature(definition: CallableDefinition): FunctionSignature | undefined;
export declare function makeCallable(meta: CallableMeta): NatlangCallable;
/** The kernel definition of a `.nl` record. */
export declare function natlangDefinition(record: NatlangRecord): CallableDefinition;
/**
 * A callable for a named `.nl` definition, with its callable-folder children as attributes. `home` is the platform the
 * folder's TypeScript modules run on when host code uses them outside any task; inside a task, the task's runtime's wins.
 */
export declare function namedCallable(name: string, record: NatlangRecord, bound?: Frame, home?: Platform): NatlangCallable;
/**
 * Define a natural-language function from `.nl` source text at run time: the dynamic counterpart of a
 * `.nl` file, for apps whose users author functions (notebook cells, wiki cells, generated tools).
 * `codebase` is its callable context, for example the records of a loaded callable folder.
 */
export declare function defineNatlang(text: string, options?: {
    name?: string;
    types?: Record<string, string>;
    codebase?: Record<string, ItemRecord>;
}): NatlangCallable;
export declare function attachChildren(target: object, codebase: Record<string, ItemRecord>, bound?: Frame, home?: Platform): void;
/** The value of one item in its folder `level`. */
export declare function itemValue(item: ItemRecord, level: Record<string, ItemRecord>, bound?: Frame, home?: Platform): unknown;
/** The callable tree for a whole callable folder (for example `natlang.d/`), as a record. */
export declare function callableTree(codebase: Record<string, ItemRecord>, bound?: Frame, home?: Platform): Record<string, unknown>;
/** An inline `nl` instance: one source definition, a fresh instance per evaluation of the tag. */
export declare function inlineCallable(definition: CallableDefinition, instructions: string | ((frame: Frame) => string), captures: Record<string, CaptureCell>, classes?: ReadonlyMap<string, Function>, bound?: Frame, provenance?: Record<string, unknown>, rebindInline?: CallableMeta['rebindInline']): NatlangCallable;
export {};
