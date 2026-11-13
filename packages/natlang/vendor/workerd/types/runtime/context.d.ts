/**
 * Task context and its propagation.
 *
 * A frame identifies the task a natlang call belongs to and the chain of natlang definitions
 * that led to it. Node propagates frames with `AsyncLocalStorage`; browsers use a synchronous
 * slot that compiled code restores after every `await` (see `bindAwait`).
 */
import type { NatlangTask } from './runtime.js';
import type { ResolvedWeightStack } from '../adaptation/weights/binding.js';
import type { FileHandle, Folder, FolderHandle } from '../native/scoped-fs.js';
/** Root/named calls start at zero; five nested ad hoc calls may be active below them. */
export declare const MAX_AD_HOC_NL_DEPTH = 5;
export declare const canGenerateNl: (frame?: Frame) => boolean;
/** The distribution a decision readout scored: each allowed reply (JSON text) and its probability. */
export type DecisionReadout = {
    options: string[];
    probabilities: number[];
};
export type Frame = Readonly<{
    task: NatlangTask;
    /** Type aliases visible in this invocation's authored program, inherited by runtime-created typed readers. */
    typeAliases?: Readonly<Record<string, string>>;
    /** Call identities of the natural-language definitions that are currently active above this point. */
    chain: readonly string[];
    /** The authored TypeScript functions currently active above this point, innermost first. */
    active?: ActiveCall;
    /** Call ID of the natlang invocation that created this frame, if any. */
    parentCallId?: string;
    programOwner?: string;
    /** Whether that invocation is an inline `nl` function: a judgment eval code handed over. */
    inline?: boolean;
    /** Receives the scored decision readout of the natural-language call started in this frame (`decide` in eval). */
    readout?: (scored: DecisionReadout) => void;
    /** Active ad hoc nl/delegate layers since the most recent file-backed .nl root. */
    adHocDepth?: number;
    /** Normalized instructions of the active ad hoc nl calls above this point (a child asking its own question again). */
    adHocQuestions?: readonly string[];
    /** System prompt text for the one invocation started in this frame (not inherited by its children). */
    systemAddendum?: string;
    /** The model the one invocation started in this frame runs on (`fn.on({ model })`; not inherited by its children). */
    model?: string;
    /** The call site the compiler marked for the one call started in this frame (compiler/call-flow.ts, runtime/fusion.ts). */
    fusionSite?: string;
    /** Ancestor-visible scoped handles rebased into this invocation's copy-on-write view. */
    scopedHandleReplacements?: ReadonlyMap<Folder | FolderHandle | FileHandle, Folder | FolderHandle | FileHandle>;
    /**
     * Aborts when the work running in this frame should stop: the task is cancelled, the call this frame belongs to
     * failed, or the eval that started it failed or finished without awaiting it. Child calls derive theirs from it.
     */
    signal?: AbortSignal;
    /** The controller of the natural-language call this frame belongs to (aborts its remaining children when it fails). */
    abort?: AbortController;
    /** Services seen by code running in this frame instead of the task's (a compiled case's journaled services). */
    services?: Readonly<Record<string, object>>;
    /** Skill files bound to this invocation; inline `nl` children inherit this exact scope. */
    skillFiles?: Readonly<Record<string, string | Uint8Array>>;
    /** The lexical weight stack of the invocation that created this frame, resolved from the callee's binding
     * (tuning/binding.ts). Each call replaces it; it is never inherited by a callee. */
    weights?: ResolvedWeightStack;
    /** The exact instruction and disclosed skill texts of that invocation, filled when its node is prepared; tuning
     * records them so training can put each binding's soft state at their positions (plan §3.3). */
    invocationTexts?: {
        instructions?: string;
        skills?: Readonly<Record<string, string>>;
    };
}>;
/** One active call of an authored TypeScript function, linked to the calls active above it. */
export type ActiveCall = {
    readonly id: string;
    readonly args: readonly unknown[];
    readonly parent?: ActiveCall;
    /** The nearest call above this one of the same function. */
    readonly same?: ActiveCall;
    /** Argument positions that got smaller at every re-entry of this function since its first call in the chain. */
    readonly descent?: readonly Descent[];
    /** Direct parts of an argument, collected the first time a re-entry is checked against it. */
    parts?: Map<number, Set<unknown>>;
};
type Descent = {
    readonly position: number;
    readonly kind: 'part' | 'length' | 'integer';
};
/**
 * Natural-language call promises that eval code passed to Promise.race or Promise.any. A raced call still running when
 * its eval finishes lost the race: it is stopped without failing the eval.
 */
export declare const racedCalls: WeakSet<object>;
/** The kernel's tracked call promise behind each promise a natlang callable returned. */
export declare const startedCalls: WeakMap<object, object>;
/** Record that eval code raced these values (Promise.race, Promise.any). */
export declare function markRaced(values: readonly unknown[]): void;
/**
 * Promise.race and Promise.any in an eval realm record the calls they were given: a natural-language call that lost
 * the race and is still running when its eval finishes is stopped without failing the eval (spec: Eval).
 */
export declare function markRaces(realmPromise: PromiseConstructor): void;
export interface ContextStore {
    current(): Frame | undefined;
    run<T>(frame: Frame | undefined, fn: () => T): T;
    /**
     * For stores that lose the frame across an `await` (a synchronous slot): compiled code turns `await x` into
     * `(await bindAwait(x))()`, which captures the frame before the suspension and restores it on resumption.
     */
    bindAwait?<T>(value: T | PromiseLike<T>): Promise<() => T>;
}
/** Synchronous slot. Compiled browser code restores it after each `await`. */
export declare class SlotContextStore implements ContextStore {
    private active?;
    current(): Frame | undefined;
    run<T>(frame: Frame | undefined, fn: () => T): T;
    /** Used by the await-restoration transform. */
    restore(frame: Frame | undefined): void;
    readonly bindAwait: <T>(value: T | PromiseLike<T>) => Promise<() => T>;
}
/** Make `store` one the current frame is looked up in; called when a runtime is created. */
export declare function useContextStore(store: ContextStore): void;
export declare function currentFrame(): Frame | undefined;
/** Run `fn` in `frame`, in the context store of the platform of the runtime the frame's task belongs to. */
export declare function runInFrame<T>(frame: Frame | undefined, fn: () => T): T;
/**
 * Browsers have no AsyncLocalStorage: a callback a promise or timer runs later would lose the task frame, and with it
 * the recursion guard's view of what is running. While a frame is current, these hand it to the callbacks they
 * schedule, as AsyncLocalStorage does in Node; with none current they behave as before. Installed once per realm.
 */
export declare function propagateSlotFrames(slot: SlotContextStore, realm?: typeof globalThis): void;
export declare class NatlangContextError extends Error {
    constructor(message?: string);
}
export declare class NatlangRecursionError extends Error {
    readonly definitionId: string;
    readonly chain: readonly string[];
    constructor(definitionId: string, chain: readonly string[], label?: string, message?: string);
}
/** The readable name in an authored callable's guard ID (`prefix#name@position`). */
export declare const guardName: (id: string) => string;
/**
 * Enter an authored function. A function already active in its own call chain may run again only on a smaller
 * argument: a part of the argument it had (reachable through its properties or elements), a shorter array or string,
 * or a smaller non-negative integer. The same position must keep getting smaller along the chain, and a part may not
 * repeat, so every chain of re-entries ends (spec: Iteration and termination).
 */
export declare function guard<T>(id: string, fn: () => T, args?: readonly unknown[], label?: string): T;
export {};
