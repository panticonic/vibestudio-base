/**
 * The tiered execution engine (plans/TIERED_ENGINE.md). One natural-language function runs at a ladder of tiers, chosen
 * per call: the highest admissible tier serves, its output is verified, and a failure deoptimizes to the next lower tier.
 * Evidence (served, deopted, shadow comparisons) moves a tier between `shadow`, `active` and `demoted` by the same
 * rule and settings as the compilation cases (calls/evidence.ts); the ladder is built from what the specializer stored.
 *
 * This module is platform-neutral and knows nothing of the kernel: the kernel hands it a `TierHost` whose `run` performs
 * one attempt of the existing dispatch (runtime/kernel.ts runDefinition) under a `TierAttempt` plan.
 */
import type { CallCapture } from './recorder.js';
import type { LoadedCase } from './compilations.js';
import { type Evidence, type EvidenceRule, type EvidenceState, type PromotionDecision, type TierEvidence } from './evidence.js';
import { type CallStoreSettings } from './types.js';
/**
 * 0 the teacher model, 1 the student model, 2 specialized natural language (trace-specialized guidance for the student),
 * 3 crisp code behind guards (the specializer's compiled cases, and registered implementations), 4 Neuralese.
 */
export type TierLevel = 0 | 1 | 2 | 3 | 4;
export type TierStateName = 'active' | 'shadow' | 'demoted';
/** How the kernel runs one attempt. Absent from `InvokeOptions` means the kernel behaves exactly as before. */
export type TierAttempt = {
    tier: string;
    /** Nothing may serve but a crisp case: when none does, the attempt ends in `Deopt` before any model runs. */
    strict: boolean;
    /** Whether the stored compilation's cases may serve (default true). */
    compiled?: boolean;
    /** Model profile name (`options.models`) for the agent, or to continue a hand-off. Default: the function's own. */
    model?: string;
    /** Specialized guidance for the model, added to its system prompt for this attempt (tier 2). */
    guidance?: string;
    /** A tier's own crisp case, tried before stored compilations; admitted by the tier's guard already. */
    cases?: LoadedCase[];
    /** Set by a tier's case when it declined the call after running (its output check failed): why. */
    declined?: string;
    /** Set by the kernel: the call's record, so the engine can read which executor served it. */
    capture?: CallCapture;
};
export type TierInput = {
    name: string;
    /** The call's arguments by parameter name. */
    args: Record<string, unknown>;
    /** Run one attempt through the kernel under a plan. */
    run(plan: Omit<TierAttempt, 'tier'>): Promise<unknown>;
    hasModel(name: string): boolean;
    /** Whether a call store records this call (tier 3 is served through its records). */
    recorded: boolean;
};
export type Verdict = boolean | string;
type Check = (args: Record<string, unknown>, output: unknown) => Verdict | Promise<Verdict>;
export interface Tier {
    readonly id: string;
    readonly level: TierLevel;
    /** The guard over inputs, evaluated before serving. */
    canServe(input: TierInput): boolean | Promise<boolean>;
    serve(input: TierInput): Promise<unknown>;
    /** The check over outputs after serving: true, or false / a reason string to deoptimize. */
    verify(input: TierInput, output: unknown): Verdict | Promise<Verdict>;
    /** Produce the output without serving it, for shadow comparison. Absent: the tier cannot be shadowed. */
    shadow?(input: TierInput): Promise<unknown>;
}
/** Tiers 0 and 1: a model profile interprets the source. `model` undefined is the function's own model. */
export declare class ModelTier implements Tier {
    readonly level: 0 | 1;
    readonly model: string | undefined;
    private readonly check?;
    readonly id: string;
    constructor(level: 0 | 1, model: string | undefined, check?: Check | undefined, shadowable?: boolean);
    shadow?: (input: TierInput) => Promise<unknown>;
    canServe(input: TierInput): boolean;
    serve(input: TierInput): Promise<unknown>;
    verify(input: TierInput, output: unknown): Verdict | Promise<Verdict>;
}
/**
 * Tier 2: the student model under the specializer's recorded guidance (trace-specialized instructions or examples,
 * the compilation's `instructions.md`, written by the specializer's writeGuidance.nl). The tier appears in a ladder
 * only when a compilation carries it.
 */
export declare class SpecializedTier implements Tier {
    readonly model: string | undefined;
    readonly guidance: string;
    private readonly check?;
    readonly id = "tier2";
    readonly level = 2;
    constructor(model: string | undefined, guidance: string, check?: Check | undefined, shadowable?: boolean);
    shadow?: (input: TierInput) => Promise<unknown>;
    private plan;
    canServe(input: TierInput): boolean;
    serve(input: TierInput): Promise<unknown>;
    verify(input: TierInput, output: unknown): Verdict | Promise<Verdict>;
}
/**
 * Tier 3, stored cases: the compilation the specializer wrote for this function (calls/compilations.ts). Its cases are
 * crisp TypeScript with input guards, each with its own state in the store; the kernel admits them (`admit`) and
 * serves the first active case whose guard holds. Present in a ladder only when the compilation has an active case.
 */
export declare class CrispTier implements Tier {
    private readonly fallbackModel?;
    private readonly check?;
    readonly id = "tier3";
    readonly level = 3;
    constructor(fallbackModel?: string | undefined, check?: Check | undefined);
    canServe(input: TierInput): boolean;
    serve(input: TierInput): Promise<unknown>;
    verify(input: TierInput, output: unknown): Verdict | Promise<Verdict>;
}
/** A hand-written crisp implementation of a function, as a registered tier-3 case. */
export type CrispImplementation<A = Record<string, unknown>, R = unknown> = {
    /** Name of the implementation (appears in the case hash and the trace). */
    id: string;
    /** Input-shape guard: a synchronous predicate over the arguments. */
    when(args: A): boolean;
    run(args: A): R | Promise<R>;
    /** Check over the output; false or a reason deoptimizes before the output is served. */
    verify?(args: A, output: R): Verdict | Promise<Verdict>;
    /** Whether running it twice is harmless, so shadow replay may call it beside a lower tier. */
    pure?: boolean;
};
/**
 * Tier 3, registered implementation: crisp code behind a guard, served through the kernel's crisp-case path (type check,
 * refinements, records, hand-off after effects) as a synthetic case whose hash starts with `tier:`. Not a separate
 * level from the stored cases: the same kind of artifact, with its own state in the tier ledger because the store
 * keeps no case row for it.
 */
export declare class ImplementationTier implements Tier {
    readonly implementation: CrispImplementation;
    private readonly fallbackModel?;
    readonly id: string;
    readonly level = 3;
    constructor(implementation: CrispImplementation, fallbackModel?: string | undefined);
    shadow?: (input: TierInput) => Promise<unknown>;
    canServe(input: TierInput): boolean;
    serve(input: TierInput): Promise<unknown>;
    verify(): Verdict;
}
/** Tier 4: a Neuralese soft program or adapter. Interface only: it never serves until a learning-continuum artifact exists. */
export declare class NeuraleseTier implements Tier {
    readonly id = "tier4";
    readonly level = 4;
    canServe(): boolean;
    serve(): Promise<unknown>;
    verify(): Verdict;
}
/**
 * Per function: which model profiles serve, and a few per-tier options. Thresholds are not here: promotion and demotion
 * use the store's settings (`acceptanceBound`, `promotionComparisons`, `promotionLiveComparisons`, `promotionPolicy`),
 * the same ones the compilation cases use. Tiers 2 and 3 come from the specializer's compilation; nothing names them.
 */
export type TierSettings = {
    /** Model profile (`options.models`) of the frontier/teacher tier. Default: the function's own model. */
    tier0?: {
        model?: string;
    };
    /** The student tier: a model profile. `start: 'shadow'` makes it earn promotion by shadow evidence. */
    tier1?: {
        model: string;
        start?: TierStateName;
        verify?: Check;
        shadow?: boolean;
    };
    /** Specialized natural language (the compilation's `instructions.md`), run on the student. Starts in `shadow`. */
    specialized?: {
        enabled?: boolean;
        start?: TierStateName;
        verify?: Check;
        shadow?: boolean;
    };
    /**
     * Crisp code. The compilation's cases join the ladder by themselves (`enabled: false` turns them off);
     * `implementations` registers hand-written ones, which start in `shadow` unless told otherwise.
     */
    crisp?: {
        enabled?: boolean;
        verify?: Check;
        implementations?: CrispImplementation[];
        start?: TierStateName;
    };
    /** Interface stub. */
    tier4?: Tier;
    /** Fraction of served calls that also run each shadow/demoted tier above them (default 0). */
    shadowRate?: number;
    /** Whether two outputs agree for shadow comparison. Default: equal canonical values. */
    same?: (served: unknown, shadow: unknown) => boolean;
};
/** What the specializer stored for a function: how many of its compiled cases are active, and its specialized guidance if any. */
export type SpecializerOutput = {
    cases: number;
    guidance?: string;
};
export type TierEngineOptions = {
    functions: Record<string, TierSettings>;
    random?: () => number;
};
export type TierEventName = 'served' | 'deopt' | 'shadow_equal' | 'shadow_worse' | 'promoted' | 'demoted';
export type TierEvent = {
    fn: string;
    tier: string;
    event: TierEventName;
    /** For `deopt`: `guard` (the tier declined; not a failure), `verify`/`error` (the tier was wrong), `infrastructure` (bad luck). */
    kind?: 'guard' | 'verify' | 'error' | 'infrastructure';
    reason?: string;
    to?: string;
    call_id?: string | null;
    /** The tier's state when the event happened (so a store can be folded without the configuration). */
    state?: EvidenceState;
    /** The call belongs to the failed attempt itself (its cost was wasted). */
    own?: boolean;
    evidence?: Record<string, unknown>;
};
/**
 * The tiers' running evidence. Counters fold the events (calls/evidence.ts `foldEvent`); promotion and demotion are
 * decisions of the shared policy, applied here as events arrive (`inline`) or later by `reviewPromotions` from the
 * specializer loop (policy `nl`), and read back from the store as `promoted` / `demoted` events.
 */
export declare class TierLedger {
    private readonly rows;
    private readonly lastCall;
    private readonly seen;
    state(fn: string, tier: string, initial: TierStateName): TierStateName;
    stats(fn: string, tier: string): Evidence | undefined;
    /** Every (function, tier) with evidence, with the last call that carried an event for it. */
    entries(): {
        fn: string;
        tier: string;
        row: TierEvidence;
        call: string | undefined;
    }[];
    row(fn: string, tier: string, initial?: EvidenceState): TierEvidence;
    /**
     * Fold an event in. With `inline`, the crisp policy decides straight away and the derived `promoted` / `demoted`
     * event is returned; otherwise the decision is left to the policy loop. `promoted` / `demoted` events are decisions
     * already taken: they set the state.
     */
    apply(ev: TierEvent, rule: EvidenceRule, initial: TierStateName, inline?: boolean): TierEvent | undefined;
    /** Apply a policy's decision about a tier (reviewPromotions); returns the event to record when the state moved. */
    decide(fn: string, tier: string, verdict: PromotionDecision, by: string): TierEvent | undefined;
    /**
     * Rebuild state from the events a store kept (annotations of kind `tier`): everything the first time, then, at most every
     * 5 s, only the decisions others took since (a policy loop in another process). `fn` limits the fold to one function.
     */
    hydrate(store: object | undefined, fn: string | undefined, initial: (tier: string) => TierStateName, rule: EvidenceRule): void;
}
export declare class TierEngine {
    readonly options: TierEngineOptions;
    readonly ledger: TierLedger;
    readonly random: () => number;
    constructor(options: TierEngineOptions);
    settingsFor(name: string): TierSettings | undefined;
}
export type TierStoreLike = {
    annotate?(callId: string, kind: string, value: unknown, source?: string, pin?: boolean): void;
    settings?(): CallStoreSettings;
};
export type TierHost = {
    name: string;
    args: Record<string, unknown>;
    store?: TierStoreLike;
    /** What the specializer stored for this function revision (its active cases, its specialized guidance). */
    specialized?(): SpecializerOutput;
    /** One attempt of the kernel's dispatch under a plan; the plan's `capture` is set by the kernel. */
    run(plan: TierAttempt): Promise<unknown>;
    hasModel(name: string): boolean;
    /** Record trace events for this call. */
    emit(events: Record<string, unknown>[]): void;
};
/**
 * The ladder for a function, highest tier first, built from what the specializer produced (`found`) and the named model
 * profiles. Tier 0 is always last: it is the terminal tier.
 */
export declare function ladderOf(settings: TierSettings, found?: SpecializerOutput): Tier[];
/**
 * Serve one call: try each admissible tier from the highest, verify, and deoptimize downward. Tier 0 is terminal: its
 * errors propagate and its output is served unverified-by-fallback (a failed check is recorded, not retried).
 */
export declare function runTiered(engine: TierEngine, settings: TierSettings, host: TierHost): Promise<unknown>;
export {};
