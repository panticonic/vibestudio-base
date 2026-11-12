/**
 * Runtime support targeted by the natlang compiler's lowering. Compiled modules import this as
 * `__natlang`; eval programs receive the same functions through their scope. Nothing here parses or
 * evaluates raw `nl` text: an uncompiled `nl` fails loudly.
 */
import type { InlineLambdaPlan } from '../compiler/inline.js';
import { type TargetDescriptor } from '../compiler/targets.js';
import { guard } from './context.js';
import { type NatlangCallable } from './callable.js';
import type { Representation } from '../native/representation.js';
import { type ItemRecord, type NatlangRecord } from './loader.js';
import type { CallableDefinition } from './kernel.js';
import { importedNativeArtifacts } from '../native/nz-file.js';
import { readNeuraleseForCurrentTask } from '../neuralese/combinators.js';
export { guard };
/**
 * Compiler target for a call the compiler marked as part of a possible hand-off between named functions (compiler/call-flow.ts
 * `fusionCallSites`). The arguments are already evaluated. With fusion off (no `fusion` runtime option) this is the call.
 * With it on, the one call made here carries its site ID, so `engageFusion` can match it to a planned edge.
 */
export declare function fuseSite<A extends unknown[], R>(site: string, call: (...args: A) => R, ...args: A): R;
/** Rebind only a compiler-created inline nl value; named and opaque callables have no recipe. */
export declare function rebindInlineCallable(value: unknown, captures: Record<string, unknown>, origin?: InlineInstructionOrigin, sources?: Record<string, 'input' | 'local' | 'block' | 'handle'>): NatlangCallable;
/** Compiler target for automatic JavaScript string coercion of a Neuralese reference. */
export declare const readNeuralese: typeof readNeuraleseForCurrentTask;
/** Read a declared soft-or-crisp union while preserving ordinary JavaScript coercion for crisp arms. */
export declare function readNeuraleseIfReference(value: unknown): Promise<unknown>;
/** String.concat after async reads, with receiver, method and arguments evaluated before coercion. */
export declare function concatNeuralese(receiver: unknown, method: (...values: unknown[]) => unknown, values: readonly unknown[], read: (value: unknown) => Promise<unknown>): Promise<string>;
/** Await only the promises produced by a statically recognized readout callback on native Array#map. */
export declare function mapNeuraleseReadout(receiver: unknown, method: unknown, args: readonly unknown[]): Promise<unknown[]>;
/** Invoke a captured native or custom method without consulting a mutable `.call` property. */
export declare function invokeWithReceiver(method: unknown, receiver: unknown, args: readonly unknown[]): unknown;
/** Preserve custom join dispatch; only the native Array join gets typed async element reads. */
export declare function joinNeuralese(receiver: unknown, method: unknown, args: readonly unknown[], read: (value: unknown) => Promise<unknown>): Promise<{
    value: unknown;
}>;
/** Preserve Array#toString's dynamic join dispatch while reading direct soft elements only for intrinsic join. */
export declare function arrayToStringNeuralese(receiver: unknown, method: unknown, args: readonly unknown[], read: (value: unknown) => Promise<unknown>): Promise<{
    value: unknown;
}>;
/** Portable natlang type text for a target descriptor; host objects become `Live<...>`. */
export declare function targetType(target: TargetDescriptor): string;
export declare function planDefinition(plan: InlineLambdaPlan, codebase?: Record<string, unknown>): CallableDefinition;
/** Join cooked template strings with interpolated values, as JavaScript would. */
export declare function interpolate(strings: readonly string[], values: readonly unknown[]): string;
/** Actual parent eval identity; supplied by the tool executor, never inferred from text. */
export type InlineInstructionOrigin = {
    parentInvocationId: string;
    toolCallId: string;
    actionOrdinal: number;
    writtenCodeSha256: string;
    checkedCodeSha256: string;
    sourceTemplateSpan?: {
        start: number;
        end: number;
    };
};
export type CaptureAccessors = Record<string, readonly [() => unknown, ((value: unknown) => void)?]>;
/** Create an inline natlang callable instance for a compiled `nl` expression. */
export declare function inline(plan: InlineLambdaPlan, values: readonly unknown[], accessors: CaptureAccessors, context?: Record<string, unknown>, version?: number, bound?: import('./context.js').Frame, origin?: InlineInstructionOrigin): NatlangCallable;
/** Selected-executor counterpart: capture getter/setter calls are asynchronous guest invocations. */
export declare function inlineSelected(plan: InlineLambdaPlan, values: readonly unknown[], accessors: Record<string, unknown>, context?: Record<string, unknown>, version?: number, bound?: import('./context.js').Frame, origin?: InlineInstructionOrigin): Promise<NatlangCallable>;
/**
 * A call site of a natlang function with a representation-generic result, as the compiler lowered it: `fn(args)`
 * becomes `instantiate(fn, representation, site)(args)`, the representation being the instance its expected type
 * picked (DECISIONS.md 2026-10-09).
 */
export declare function instantiate(fn: unknown, representation: Representation, site: string): (...args: unknown[]) => Promise<unknown>;
/** A named `.nl` import compiled into a module: the definition record embedded at build time. */
export declare function named(name: string, record: NatlangRecord, home?: import('./platform.js').Platform): NatlangCallable;
/**
 * Register the crisp checkers a program's `refinements.ts` exports (compiled `.nl` modules call this when the program
 * has such a module). Keys are normalized predicates. The same predicate with different code is an error, because the
 * table is process-wide.
 */
export declare function registerCrisp(table: unknown, source?: string): void;
/** A callable folder such as `natlang.d/`, as a record of callables. */
export declare function folder(codebase: Record<string, ItemRecord>): Record<string, unknown>;
/**
 * A `.nz` import compiled into a module: the file is embedded at build time. Its blocks are kept for the runtime's
 * store (`importedNativeArtifacts`); soft-function exports become callables.
 */
export declare function nzModule(base64: string): Record<string, unknown>;
export { importedNativeArtifacts };
/** Numeric loop bounds are fixed at entry; rounding must never stall the counter. */
export declare function numericProgress(initial: number, bound: number, upward: boolean): (current: number) => void;
/** Runtime half of the finite-iteration policy: `for (x of y)` becomes `for (x of finite(y, "y"))`. */
export declare function finite<T>(source: Iterable<T>, label?: string): Iterable<T>;
/**
 * The bounded counterpart of `for (const item of array.entries()/keys()/values())`.
 * The standard Array prototype methods use their native iterators under the array no-growth rule. A replacement
 * method is still looked up and called once, then its result is classified by the existing finite-iteration policy
 * (so an array/string/Map/Set result keeps its usual behavior). Native iterators preserve holes, inherited indexed
 * values, and ordinary Array Iterator ordering.
 */
export declare function finiteArrayIterator<T>(source: unknown, method: 'entries' | 'keys' | 'values', label?: string): Iterable<T>;
/**
 * Runtime half of the policy for `for await`: an async iterable passes, since restricted code cannot define one (it
 * comes from the host: a response body, a service stream, a package, an iterateOn stream); anything else follows the
 * `for ... of` rules.
 */
export declare function finiteAsync<T>(source: unknown, label?: string): AsyncIterable<T> | Iterable<T>;
/** Attach the compiler's call-site identity to an `iterateOn` expression. */
export declare function site<T>(id: string, iteration: T): T;
/** `import { wiki } from 'natlang:services'` resolves each access against the current task. */
export declare function service(name: string): object;
/** Explicit selected surface for a configured service; methods resolve the current task on every call. */
export declare function selectedService(name: string): object;
/** The raw `nl` export: reached only when a module was not compiled by the natlang compiler. */
export declare function uncompiled(): never;
