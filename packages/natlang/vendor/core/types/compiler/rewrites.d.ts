import { type GraphInput } from '../native/graph.js';
import type { NativeTraceRecorder } from '../native/trace.js';
export declare const REWRITE_RULES: readonly ["map-fusion", "read-map", "map-identity", "combine-reassociate", "combine-identity", "split-zip"];
export type RewriteRule = typeof REWRITE_RULES[number];
export declare const NO_REWRITE_MARKER = "natlang-no-rewrite";
/**
 * One whole-program comparison of a rule, for one model and dialect version. `verdict` is the rubric's judgment of
 * the rewritten executions against the unrewritten ones on held-out programs.
 */
export type RuleMeasurement = {
    rule: RewriteRule;
    model: string;
    dialect: string;
    comparison: string;
    verdict: 'no-harm' | 'harm' | 'inconclusive';
    rubric?: string;
    measuredAt?: string;
    /** For `read-map`: which side the comparison found cheaper (default forward: `read(map(v, f))` → `f(read(v))`). */
    direction?: 'forward' | 'reverse';
};
/** Which rules are enabled for the current versions, and by which comparison. */
export declare class RewriteGate {
    #private;
    readonly version: {
        model: string;
        dialect: string;
    };
    constructor(version: {
        model: string;
        dialect: string;
    }, measurements?: readonly RuleMeasurement[], options?: {
        disabled?: readonly RewriteRule[];
    });
    /** Every rule off: no comparisons yet. */
    static off(version?: {
        model: string;
        dialect: string;
    }): RewriteGate;
    enabled(rule: RewriteRule): RuleMeasurement | undefined;
    /** The enabled set, recorded in each trace's manifest. */
    enabledRules(): RewriteRule[];
}
export type RewriteRecord = {
    rule: RewriteRule;
    site: string;
    enabled_by: string;
    replaced: string[];
};
export type RewriteSkip = {
    rule: RewriteRule;
    site: string;
    reason: 'not-enabled' | 'disabled-site' | 'disabled-program' | 'effect' | 'other-use';
};
export type RewriteResult = {
    code: string;
    applied: RewriteRecord[];
    skipped: RewriteSkip[];
};
/**
 * Apply the enabled rules to `source`. Intermediate values bound by `const a = map(v, g)` and used once, in
 * `map(a, f)` later in the same block with nothing effectful in between, are fused as if written nested.
 */
export declare function rewriteCombinators(source: string, options: {
    gate: RewriteGate;
    fileName?: string;
    disabled?: boolean;
}): RewriteResult;
/** Record applied rewrites as `rewrite` nodes of an execution graph. */
export declare function recordRewrites(trace: NativeTraceRecorder | undefined, records: readonly RewriteRecord[], inputs?: readonly GraphInput[]): string[];
