/**
 * Refinement checks: `Is<T, "predicate">` (plans/REFINEMENT_TYPES.md).
 *
 * A refined type is its base type plus a natural-language predicate. This module finds the refined positions of a value
 * (`collectObligations`), judges each predicate with one decision-readout scoring pass (`decisionJudge`: P(true) over
 * the options `true` / `false`), caches verdicts by content (`VerdictCache`), and turns the outcome into stable errors
 * (`refinement-unsatisfied`, `refinement-undecided`). The call sites (the agent's return path, the kernel's argument
 * and result checks, services) live elsewhere and only ask `RefinementChecker.check`.
 */
import type { DecisionScorer } from '../contracts.js';
import type { NativeTraceRecorder } from './trace.js';
import { type PredicateSettings, type RefinementSettings } from './refinement-settings.js';
export { parseRefinementSettings } from './refinement-settings.js';
export type { BandPolicy, PredicateSettings, RefinementMode, RefinementSettings } from './refinement-settings.js';
import { TypeEnv, type Type } from './types.js';
export type RefinementCode = 'refinement-unsatisfied' | 'refinement-undecided' | 'refinement-predicate-invalid';
/** A refinement could not be established. The message is one sentence naming the predicate and the fix. */
export declare class RefinementError extends Error {
    readonly code: RefinementCode;
    readonly detail: {
        predicate?: string;
        path?: string;
        probability?: number;
    };
    constructor(code: RefinementCode, message: string, detail?: {
        predicate?: string;
        path?: string;
        probability?: number;
    });
}
/** What a judge said about one (value, predicate): P(true). Thresholds are applied after, so they never invalidate it. */
export type RefinementVerdict = {
    probability: number;
    judge: string;
};
/** Content-addressed verdicts: key = sha256(canonical value), normalized predicate, judge id. */
export interface VerdictCache {
    get(key: string): RefinementVerdict | undefined | Promise<RefinementVerdict | undefined>;
    set(key: string, verdict: RefinementVerdict): void | Promise<void>;
}
export declare class MemoryVerdictCache implements VerdictCache {
    private readonly limit;
    private readonly verdicts;
    constructor(limit?: number);
    get(key: string): RefinementVerdict | undefined;
    set(key: string, verdict: RefinementVerdict): void;
    get size(): number;
}
/** Stable JSON: object keys sorted, so equal values hash equally. */
export declare function canonicalValue(value: unknown): string;
export declare const verdictKey: (value: unknown, predicate: string, judge: string) => string;
export interface RefinementJudge {
    readonly id: string;
    /** `scorer`: one decision-readout scoring pass (preferred). `call`: an ordinary natural-language call returning a boolean. */
    readonly kind?: 'scorer' | 'call';
    /** P(the value satisfies the predicate), from one scoring pass. `turn` places a scoring pass in its caller's
     * execution graph as its own model turn (graph node, recorded-turn link, rollout identity). */
    probability(value: unknown, predicate: string, signal?: AbortSignal, turn?: JudgeTurn): Promise<number>;
}
export declare const JUDGE_SYSTEM_PROMPT: string;
/** Where a scored judgement runs: its own invocation identity, the calling invocation and that call's trace. */
export type JudgeTurn = {
    invocationId: string;
    callId: string;
    trace?: NativeTraceRecorder;
};
/** The judge as a decision readout: `holds(value, predicate): boolean` scored over the replies `true` and `false`. */
export declare function decisionJudge(scorer: DecisionScorer, options: {
    id: string;
    system?: string;
}): RefinementJudge;
/** The fixed instructions of the judge when it runs as an ordinary call: `holds(value, predicate): boolean`. */
export declare const JUDGE_CALL_INSTRUCTIONS: string;
/** The judge for a driver that cannot score replies: `holds` as a normal tool-loop call. A verdict is 1 or 0. */
export declare function callJudge(holds: (value: unknown, predicate: string, signal?: AbortSignal) => Promise<boolean>, id: string): RefinementJudge;
export type Obligation = {
    path: string;
    predicate: string;
    value: unknown;
};
/**
 * The refined positions of `value` under `type`, each with its value: a refined slot, or a field, list element or
 * dict entry of one. A value that does not fit the structure yields nothing here; the structural check reports it.
 */
export declare function collectObligations(value: unknown, type: Type, env: TypeEnv, path?: string): Obligation[];
export type RefinementOutcome = 'pass' | 'fail' | 'undecided';
export type RefinementFailure = {
    code: Exclude<RefinementCode, 'refinement-predicate-invalid'>;
    path: string;
    predicate: string;
    probability?: number;
    message: string;
};
export type CheckContext = {
    /** Where the value entered: the return of a call, an argument, a service result, or an explicit `refine`. */
    phase: 'return' | 'argument' | 'service' | 'refine';
    judge?: RefinementJudge;
    escalation?: RefinementJudge;
    emit?: (kind: string, data: Record<string, unknown>) => void;
    callId?: string | null;
    signal?: AbortSignal;
    /** The judged call's trace: scored judgements become model turns of its execution graph. */
    trace?: NativeTraceRecorder;
};
export type RefinementCheckerOptions = {
    settings?: RefinementSettings;
    cache?: VerdictCache;
    /** Crisp checkers by normalized predicate, before the built-in `refinements` table. */
    crisp?: Record<string, (value: unknown) => boolean | undefined>;
    /** The judge used when a call site supplies none. */
    judge?: RefinementJudge;
    emit?: (kind: string, data: Record<string, unknown>) => void;
};
export declare const unsatisfiedMessage: (path: string, predicate: string, probability: number | undefined) => string;
export declare const undecidedMessage: (path: string, predicate: string, probability: number | undefined) => string;
export declare class RefinementChecker {
    private readonly options;
    readonly cache: VerdictCache;
    readonly settings: RefinementSettings;
    private readonly crisp;
    constructor(options?: RefinementCheckerOptions);
    settingsFor(predicate: string): Required<Pick<PredicateSettings, 'threshold' | 'policy' | 'mode'>> & Pick<PredicateSettings, 'band'>;
    /** The repairs an executor gets for a rejected refined return, given the model's own repair limit. */
    repairBudget(modelLimit: number | undefined): number;
    private crispVerdict;
    private probability;
    /** Judge one obligation. Never throws for an unsatisfied predicate; the outcome says so. */
    private decide;
    /** Check every obligation, concurrently (one batch of scoring passes); identical (value, predicate) pairs once. */
    check(obligations: Obligation[], context: CheckContext): Promise<RefinementFailure[]>;
    /** Check `value` against `type`: the obligations it implies, judged. */
    checkValue(value: unknown, type: Type, env: TypeEnv, context: CheckContext, path?: string): Promise<RefinementFailure[]>;
}
/** The error for the first failure of a check. */
export declare function failureError(failure: RefinementFailure): RefinementError;
/** The tool-error text the executing model sees for failures on its return value. */
export declare const failureFeedback: (failures: RefinementFailure[]) => string;
/** The refinement code at the start of a call's failure detail, if it has one. */
export declare const refinementCodeOf: (detail: string) => Exclude<RefinementCode, "refinement-predicate-invalid"> | undefined;
/**
 * Wrap service methods whose result type is declared refined (`refinements.services`): the result is checked like an nl
 * return and a failure throws to the caller. Methods without a declaration pass through.
 */
export declare function checkServiceResults<T extends Record<string, unknown>>(services: T, declared: Record<string, Type>, check: (value: unknown, type: Type, label: string) => Promise<void>): T;
