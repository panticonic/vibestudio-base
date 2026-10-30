import { tokens } from './snapshot.js';
/** One recorded call as mining sees it. */
export type Example = {
    callId: string;
    args: Record<string, unknown>;
    features: Record<string, string | number | boolean>;
    evals: string[];
    approach: string;
    split: 'training' | 'held-out';
    /** What the call did, whatever code it ran: its service calls and the functions it called, in order (`none` when nothing). */
    behavior?: string;
};
/** A behavior label from the service calls and child functions of a call, consecutive repeats folded. */
export declare function behaviorLabel(steps: readonly string[]): string;
/** Calls are split by a hash of their ID: a fifth held out, stably across runs. */
export declare const splitOf: (callId: string) => "training" | "held-out";
export type Approach = {
    id: string;
    calls: string[];
    answerOnly: boolean;
    /** The normalized programs with differing literals replaced by holes `$h0`, `$h1`, ... */
    template: string[];
    /** Per call, the literal each hole had. */
    holes: Record<string, string[]>;
};
/**
 * Group calls by approach: identical normalized programs first, then groups whose programs differ only in literals
 * (anti-unified into one template with holes).
 */
export declare function approaches(examples: readonly Example[]): Approach[];
/** A TypeScript accessor for a feature path (`items[0].kind` → `args.items?.[0]?.kind`). */
export declare function accessor(path: string): string;
/** An atomic condition: its TypeScript text and how it is evaluated. */
export type Predicate = {
    text: string;
    test: (args: Record<string, unknown>) => boolean;
};
/** A guard expression over `args`, compiled once; a guard that throws answers false. */
export declare function compileGuard(text: string): Predicate | undefined;
/** Candidate conditions from the features present in the examples. */
export declare function candidatePredicates(examples: readonly Example[]): Predicate[];
/** One rule of an induced decision list: a guard that selects one label (a behavior) with no counterexample in training. */
export type Rule = {
    label: string;
    guard: string;
    covers: string[];
    heldOut: {
        covered: number;
        correct: number;
    };
};
/**
 * Greedy decision-list induction (§5.2): repeatedly take the condition, or pair of conditions, with the widest coverage
 * among the calls not yet covered that selects a single behavior (else approach) without exception, until nothing covers `minSupport`
 * calls. Calls no rule covers are left to the agent. Held-out calls are only measured.
 */
export declare function induceRules(examples: readonly Example[], options?: {
    minSupport?: number;
    maxRules?: number;
    maxPairs?: number;
}): {
    rules: Rule[];
    unclassified: string[];
};
/** Exact precision and coverage of a guard expression over examples (for proposals from the model). */
export declare function measureGuard(guard: string, label: string, examples: readonly Example[]): {
    valid: boolean;
    error?: string;
    covered: number;
    correct: number;
    counterexamples: string[];
};
export { tokens };
