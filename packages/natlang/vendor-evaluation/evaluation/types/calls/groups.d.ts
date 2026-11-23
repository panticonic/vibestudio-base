import { splitOf, type Approach, type Example } from './mining.js';
import { type Study } from './specializer.js';
import type { CallStore } from './store.js';
/** One group: the calls that did one thing (a behavior, or an approach when every call did the same thing). */
export type Group = {
    id: string;
    label: string;
    training: Example[];
    heldOut: number;
    approaches: Approach[];
};
/** The label mining separates calls by: the behavior, unless every call had the same behavior (then the approach). */
export declare function labeler(examples: readonly Example[]): (example: Example) => string;
/** The groups worth a writer: at least `minSupport` training calls, largest first, at most `max`. */
export declare function groupsOf(subject: Study, options?: {
    minSupport?: number;
    max?: number;
}): Group[];
export type Measure = {
    valid: boolean;
    error?: string;
    ofGroup: number;
    groupSize: number;
    others: number;
    counterexamples: {
        call: string;
        did: string;
        inputs: Record<string, unknown>;
    }[];
};
/** Exactly how a guard does on the training calls: how many of the group's it admits, and which other calls. */
export declare function measure(subject: Study, group: Group, guard: string): Measure;
/** The conditions worth starting from: those admitting most of the group and nothing else, then near misses. */
export declare function candidateConditions(subject: Study, group: Group, limit?: number): (Measure & {
    guard: string;
})[];
/** The writer's folder for one group: the function, the group, examples, contrasting calls, the last report. */
export declare function renderGroup(store: CallStore, subject: Study, group: Group, functionMd: string, extra?: {
    report?: string;
}): Record<string, string>;
/**
 * One cases file from per-group case files. Each part has its imports and `export const when = ...; export const run =
 * ...;` (and any helpers it needs); a part becomes one array element, its own statements scoped inside it, so parts
 * cannot collide. Imports from the same module are merged. Returns the parts that do not have that shape.
 */
export declare function assembleCases(parts: readonly {
    id: string;
    text: string;
}[]): {
    text: string;
    included: string[];
    errors: {
        id: string;
        error: string;
    }[];
};
export { splitOf };
