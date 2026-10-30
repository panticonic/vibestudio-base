export type EnvironmentMode = 'fresh' | 'retained';
export type EvalRequest = {
    code: string;
    scope: Record<string, unknown>;
    body: boolean;
    path: string;
    /** Fail the eval if it has not finished within this many milliseconds (the eval tool's timeout_ms). */
    timeoutMs?: number;
    /** Cancels selected execution and its owned dependencies when the task stops. */
    signal?: AbortSignal;
    /** Values passed by reference (live objects, functions, capture cells); visible to code as `__live`. */
    live?: Record<string, unknown>;
};
export type HostEvent = {
    operation: string;
    [key: string]: unknown;
};
export type EvalResult = {
    result: unknown;
    events: HostEvent[];
    logs?: string[];
};
/** A console writer for one eval; the runtime pages long output for the model. */
export declare function consoleWriter(logs: string[], show: (value: unknown) => string): (...values: unknown[]) => void;
/** Settle with `work`, or fail once `timeoutMs` passes; work already started is not stopped. */
export declare function withinTimeout<T>(work: Promise<T>, timeoutMs: number | undefined): Promise<T>;
export declare class EvalFailure extends Error {
    readonly events: HostEvent[];
    readonly debug: {
        sourceStack?: string;
        logs?: string[];
    };
    constructor(message: string, events: HostEvent[], debug?: {
        sourceStack?: string;
        logs?: string[];
    });
}
/** The deliberately small boundary between the interpreter and a TypeScript evaluator. */
export interface EvalEnvironment {
    readonly authority: string;
    readonly mode: EnvironmentMode;
    readonly scopeCapabilities?: {
        allowModules?: boolean;
        allowNetwork?: boolean;
    };
    execute(request: EvalRequest): EvalResult;
    executeAsync(request: EvalRequest): Promise<EvalResult>;
    /** Evaluate a module body once; `bindings` are passed by reference. Returns the completion value. */
    evaluateModule(code: string, bindings: Record<string, unknown>): unknown;
    /** Async module evaluation for a selected semantic executor. No synchronous VM fallback. */
    evaluateModuleAsync?(code: string, bindings: Record<string, unknown>): Promise<unknown>;
    /** Install explicit platform-owned resource surfaces before any selected invocation. */
    configureNativeBindings?(configuration: {
        adaptValue(value: unknown): unknown;
        resourceIdentity?(value: unknown): object | null;
        resourceCleanup?(value: object): (() => void) | null;
    }): void;
    /** The declaration of an importable package (`pkg`) or one of its exports (`pkg.name`), if there is one. */
    declarationOf?(name: string): string | undefined;
    fork(): EvalEnvironment;
    close(): void;
}
