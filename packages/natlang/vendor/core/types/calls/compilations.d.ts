import type { Platform } from '../runtime/platform.js';
import type { CallStoreLike } from './recorder.js';
import type { CaseTier } from './types.js';
/** One crisp case of a compilation, ready to run. */
export type LoadedCase = {
    hash: string;
    position: number;
    tier: CaseTier;
    when: (args: Record<string, unknown>) => unknown;
    run: (args: Record<string, unknown>) => unknown;
    /** The `natlang:services` imports the case's own text uses; it is admitted only where the task provides them all. */
    services: string[];
};
export type LoadedCompilation = {
    id: string;
    cases: LoadedCase[];
};
/** The source text of each element of `export const cases = [...]`, in order. */
export declare function caseSources(text: string): string[];
/** The services each case of a cases file uses: names imported from `natlang:services` that its text mentions. */
export declare function caseServices(text: string): string[][];
/** Content hashes of a cases file's cases: a case keeps its tier and counts while its text is unchanged. */
export declare function caseHashes(text: string): string[];
/** Load a cases file in a definition's context. Throws a source error when it does not compile or is malformed. */
export declare function loadCases(platform: Platform, id: string, text: string, codebase: Record<string, unknown>, types: Record<string, string>): LoadedCompilation['cases'];
/**
 * What the specializer stored for a definition revision, for the tier ladder (calls/tiers.ts): the number of compiled
 * cases that are active, and the specialized guidance (`instructions.md`) if the compilation carries it. Nothing when the
 * compilation was written for another context interface.
 */
export declare function specializerOutput(store: CallStoreLike, definitionKey: string, interfaceHash: string): {
    cases: number;
    guidance?: string;
};
/** The process's view of stored compilations. */
export declare class CompilationCache {
    readonly store: CallStoreLike;
    readonly platform: Platform;
    private version;
    private checked;
    private readonly loaded;
    private readonly failures;
    constructor(store: CallStoreLike, platform: Platform);
    /** The current compilation for a definition revision whose context interface matches, or undefined. */
    get(definitionKey: string, interfaceHash: string, codebase: Record<string, unknown>, types: Record<string, string>): LoadedCompilation | undefined;
    /** Forget loaded compilations (after this process saved one). */
    invalidate(): void;
}
