/**
 * Provenance of `Untrusted<T>` values (plans/REFINEMENT_TYPES.md section 4).
 *
 * A string cannot carry a hidden tag at run time, so provenance is kept the way refinement evidence is: by content. The
 * registry maps the text of every string that entered through an untrusted slot (a service result declared
 * `Untrusted<...>`, an argument or capture typed `Untrusted<...>`, `untrusted(value, source)`) to the source that first
 * produced it. The renderer shows any registered string as a quoted data block labelled with that source.
 *
 * Taint follows exact content: a string the program derives from an untrusted one (a slice, a concatenation) is a new
 * string and is not tracked here; the compiler's `untrusted-instruction` check covers the instruction side of that gap.
 * A trusted string equal to an untrusted one is shown as data too, which errs toward caution.
 */
import type { Type, TypeEnv } from './types.js';
export declare class UntrustedRegistry {
    private readonly parent?;
    private readonly sources;
    private chars;
    /** A registry also asks `parent`: host code marks text with `untrusted(value, source)` before any task exists. */
    constructor(parent?: UntrustedRegistry | undefined);
    /** The source that produced `text`, or undefined when it is not untrusted. */
    sourceOf(text: string): string | undefined;
    /** Record every string inside `value` as coming from `source`. The first source of a text is kept. */
    markAll(value: unknown, source: string, depth?: number): void;
    /** Record the strings of `value` that sit at `Untrusted<...>` positions of `type`. */
    markTyped(value: unknown, type: Type, env: TypeEnv, source: string): void;
    private add;
}
/** Text the host marked itself with `untrusted(value, source)`, outside any task. */
export declare const hostUntrusted: UntrustedRegistry;
/** The registry of one execution scope (a natlang task): calls of that task share what they have seen. */
export declare function scopedUntrusted(scope: object): UntrustedRegistry;
/** Whether `type` has an `Untrusted<...>` position anywhere (named types followed once each). */
export declare function containsUntrusted(type: Type, env: TypeEnv, seen?: Set<string>): boolean;
/**
 * An untrusted string as a quoted data block: a fence longer than any run of backticks in the text, so the text cannot
 * close it, and an info line naming the source. The text is verbatim.
 */
export declare function untrustedBlock(text: string, source: string): string;
