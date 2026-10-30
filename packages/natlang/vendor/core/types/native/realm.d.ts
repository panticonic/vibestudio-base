/**
 * The evaluator over a realm. A platform supplies only a `Realm`, a way to run JavaScript with named bindings in its
 * global environment (a `node:vm` context, the Function constructor, a host-provided function constructor); everything
 * else an evaluator does is shared: TypeScript compilation (eval-compile.ts), the portable scope snapshot, the console,
 * the result checks and the failure reports.
 */
import { type EnvironmentMode, type EvalEnvironment, type EvalRequest, type EvalResult, type HostEvent } from './evaluator.js';
/** Where compiled eval code runs: a JavaScript realm's global environment. */
export interface Realm {
    /**
     * Run `body` as the body of a strict-mode function whose parameters are `parameters`, called with `args`, with this
     * realm's global object as its global scope (the Function constructor's contract, strict), and return what it returns.
     * A promise it returns is the caller's to await.
     *
     * `timeoutMs` bounds the synchronous part of the call where the realm can interrupt running code (a `node:vm`
     * context can); a realm that cannot ignores it, and the caller bounds the asynchronous result itself.
     */
    call(body: string, parameters: readonly string[], args: readonly unknown[], options?: {
        timeoutMs?: number;
    }): unknown;
}
/** A realm over a host-provided function constructor: `newFunction(body, name, ...parameterNames)`. */
export declare function constructorRealm(newFunction: (body: string, name: string, ...parameters: string[]) => (...args: unknown[]) => unknown, name?: string): Realm;
export declare function portable(value: unknown, seen?: Set<object>, path?: string, scope?: boolean): unknown;
/** Eval scope follows TypeScript: an absent optional property may be undefined. Published results use `portable`. */
export declare function snapshot(value: unknown): unknown;
/** Static configuration of a `RealmEnvironment`; what depends on the instance is a protected method a subclass overrides. */
export type RealmEnvironmentOptions = {
    authority: string;
    mode?: EnvironmentMode;
    /** The realm eval code runs in: asked for each evaluation in `fresh` mode, once in `retained` mode. */
    realm?: () => Realm;
    /** Synchronous run time allowed per eval where the realm can interrupt; unlimited unless set. */
    timeoutMs?: number;
    scopeCapabilities?: {
        allowModules: boolean;
        allowNetwork: boolean;
    };
    observe?: (event: HostEvent) => void;
    /** Restores the natlang task after each `await` in eval code (platforms whose context store cannot follow promises). */
    bindAwait?: <T>(value: T | PromiseLike<T>) => Promise<() => T>;
    /** A new environment of the same kind, for `fork()`. */
    fork?: () => EvalEnvironment;
};
/** Package imports in eval: validates a specifier (throws for one that may not be imported) and loads it. */
export type EvalImports = {
    validate(specifier: string): void;
    load(specifier: string): Promise<unknown>;
};
/**
 * The evaluator over a realm. Portable scope data arrives as a frozen snapshot (`self`); live objects, callables,
 * captures and the output sink arrive by reference (`__live`). A subclass adds what its realm needs around that: its
 * own realm, package imports, extra bindings, host events and cleanup.
 */
export declare class RealmEnvironment implements EvalEnvironment {
    protected readonly options: RealmEnvironmentOptions;
    readonly authority: string;
    readonly mode: EnvironmentMode;
    readonly timeoutMs?: number;
    readonly scopeCapabilities: {
        allowModules: boolean;
        allowNetwork: boolean;
    };
    protected disposed: boolean;
    private retained?;
    constructor(options: RealmEnvironmentOptions);
    fork(): EvalEnvironment;
    /** A realm for one evaluation (`fresh`) or for the environment's life (`retained`). */
    protected makeRealm(): Realm;
    /** The realm callable-folder modules run in; by default the eval realm. */
    protected moduleRealm(): Realm;
    /** Package imports for async evals, if the platform has packages. */
    protected importer(): EvalImports | undefined;
    /** Names the realm binds for eval code besides the standard ones (timers, for example). */
    protected extraBindings(): Record<string, unknown>;
    /** Events the realm's host side recorded since the last eval (callback errors, unhandled rejections, fetches). */
    protected hostEvents(): HostEvent[];
    /** Called when an asynchronous eval fails: cancel what the eval scheduled. */
    protected abandon(): void;
    /** Called by `close()`: release what the environment owns. */
    protected release(): void;
    private realm;
    private capture;
    private failure;
    private run;
    execute(request: EvalRequest): EvalResult;
    executeAsync(request: EvalRequest): Promise<EvalResult>;
    /** Evaluate a callable-folder module body; bindings are passed by reference. */
    evaluateModule(code: string, bindings: Record<string, unknown>): unknown;
    close(): void;
}
