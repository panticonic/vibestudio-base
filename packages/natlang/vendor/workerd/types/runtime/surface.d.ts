/**
 * The TypeScript surface of natlang. Keep these declarations in step with
 * `compiler/intrinsics.ts`, which supplies the same types to eval programs.
 */
import { Iteration, type IterationEvent, type IterationTrajectory, type ProgressVerdict } from './iterate.js';
export { Deopt } from '../calls/dispatch.js';
export type { IterationEvent, IterationTrajectory, ProgressVerdict };
export type { Iteration };
/** Marker for an unspecified `nl` type argument. */
export interface NlUnspecified {
    readonly __natlangUnspecified: true;
}
export interface NatlangStepError<M extends string> {
    readonly __natlangStepError: M;
}
type NatlangIsAny<T> = 0 extends (1 & T) ? true : false;
export type NatlangStepState<A extends unknown[], R> = number extends A['length'] ? (NatlangIsAny<R> extends true ? any : A[0]) : A extends [infer S, ...unknown[]] ? ([R] extends [S] ? S : NatlangStepError<'iterateOn requires the step return type to be assignable to its first parameter'>) : NatlangStepError<'iterateOn requires a step whose first parameter is the state'>;
export type NatlangStepArgs<A extends unknown[]> = number extends A['length'] ? any[] : A extends [unknown, ...infer Rest] ? Rest : never[];
/** Methods every compiled natlang callable provides. */
export interface NatlangCallableMethods<A extends unknown[], R> {
    iterateOn(initial: NatlangStepState<A, R>, ...args: NatlangStepArgs<A>): Iteration<NatlangStepState<A, R>>;
    /** The same function on another of the runtime's models (the name `model:` frontmatter takes); a new function. */
    on(options: {
        model: string;
    }): NatlangFunction<A, R>;
}
/** A compiled natural-language function: asynchronous, typed, and monitored. */
export type NatlangFunction<A extends unknown[] = any[], R = any> = ((...args: A) => Promise<R>) & NatlangCallableMethods<A, R>;
/**
 * A natural-language function with a representation-generic result (`generic: { R: T | Neuralese<T> }`, `returns: R`):
 * each call's expected type instantiates `R`, and a call that expects nothing in particular gets `T`.
 */
export type NatlangGenericFunction<A extends unknown[], C, T extends C> = (<R extends C = T>(...args: A) => Promise<R>) & NatlangCallableMethods<A, T> & {
    readonly __natlangGenericResult?: C;
};
/** An \`nl\` function without a type argument; the compiler infers its signature from its uses. */
export type NatlangUntypedFunction = ((...args: any[]) => Promise<any>) & {
    iterateOn<S>(initial: S, ...args: any[]): Iteration<S>;
    on(options: {
        model: string;
    }): NatlangUntypedFunction;
};
export type NlResult<F> = [F] extends [NlUnspecified] ? NatlangUntypedFunction : [
    F
] extends [(...args: infer A) => infer R] ? NatlangFunction<A, Awaited<R>> : NatlangFunction<any[], F>;
/** The body of a soft function literal: a model-written Neuralese block in an `nl` template. */
export interface NeuraleseBody {
    readonly __natlangNeuraleseBody: true;
}
/** The template tag `nl.with({ … })` returns: a function whose captures are exactly the listed ones. */
export interface NlWithTag<F> {
    (strings: TemplateStringsArray, body: NeuraleseBody): any;
    <G = F>(strings: TemplateStringsArray, ...values: unknown[]): NlResult<G>;
}
/** The `nl` template tag. */
export interface NlTag {
    <F = NlUnspecified>(strings: TemplateStringsArray, ...values: unknown[]): NlResult<F>;
    /**
     * An `nl` function whose captures are exactly these: plain entries are snapshots taken now; `live(x)` entries
     * are read at each call and written back. No other names are captured.
     * `nl.with<CaptureRecord, Result>(captures)` can check the finite capture schema separately from the child result;
     * child arguments remain the values passed when the returned callable is invoked.
     * @natlangIntrinsic nl.with
     */
    with<CaptureRecord extends object, Result>(captures: CaptureRecord): NlWithTag<Result>;
    with<F = NlUnspecified>(captures: {
        readonly [name: string]: unknown;
    }): NlWithTag<F>;
}
/**
 * Create an anonymous natural-language function. Exact mentions of visible names capture live bindings;
 * `nl.with({ … })` lists the captures explicitly instead.
 * @natlangIntrinsic nl
 */
export declare const nl: NlTag;
/**
 * Run a step repeatedly from an initial state until a predicate holds, with progress review.
 * @natlangIntrinsic iterateOn
 */
export declare function iterateOn<T, A extends unknown[]>(step: (state: T, ...args: A) => T | Promise<T>, initial: T, ...args: A): Iteration<T>;
/**
 * A `T` whose value satisfies the natural-language predicate `P` (plans/REFINEMENT_TYPES.md). It is a `T` everywhere;
 * crisp code obtains one from a refined natlang result, from `refine(value, predicate)` or from `assume(value, predicate)`.
 */
export type Is<T, P extends string> = T & {
    readonly __natlangRefinement: {
        [K in P]: true;
    };
};
/**
 * A `T` that came from outside the program (plans/REFINEMENT_TYPES.md section 4). It is a `T` for crisp code. The model sees
 * it only as a quoted data block labelled with its source, and the compiler refuses it in instruction text
 * (`untrusted-instruction`).
 */
export type Untrusted<T> = T & {
    readonly __natlangUntrusted: true;
};
/**
 * Mark `value` as coming from `source` (a short label such as "stdin" or "index.search") and return it as an
 * `Untrusted<T>`. Every string inside the value is shown to a model as data from `source`.
 */
export declare function untrusted<T>(value: T, source?: string): Untrusted<T>;
/**
 * Check `value` against `predicate` with the judge and return it as an `Is<T, P>`; throws `refinement-unsatisfied` (or
 * `refinement-undecided` inside the uncertainty band). Must run inside a natlang task. `refine<Is<T, "p">>(value)` is
 * lowered by the compiler to `refine(value, "p")`.
 * @natlangIntrinsic refine
 */
export declare function refine<T, P extends string>(value: T, predicate: P): Promise<Is<T, P>>;
export declare function refine<R extends Is<unknown, string>>(value: unknown): Promise<R>;
/**
 * Declare that `value` satisfies `predicate` without checking it. The assumption is recorded in the trace.
 * @natlangIntrinsic assume
 */
export declare function assume<T, P extends string>(value: T, predicate: P): Is<T, P>;
export declare function assume<R extends Is<unknown, string>>(value: unknown): R;
/** Host and application helper: one entry point over a crisp and a natural-language implementation (see ./pluggable.ts). */
export { pluggable } from "./pluggable.js";
export type { PluggableMode, PluggableImplementations, PluggableOptions } from "./pluggable.js";
