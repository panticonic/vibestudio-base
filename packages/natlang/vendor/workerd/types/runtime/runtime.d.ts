import type { EffectEvent } from '../native/effects.js';
import type { WeightBinding } from '../adaptation/weights/binding.js';
import { ProgramView } from '../adaptation/program-view.js';
import type { ProgramDescriptor, AdaptationBinding, ExecutorIdentity } from '../adaptation/types.js';
import type { AuthoredTextGuidance, ProgramGuidance, ProgramGuidanceInput } from '../guidance/program.js';
import type { EvalEnvironment } from '../native/evaluator.js';
import type { DecisionScorer, ModelTurn, ModelTurnDelta, ModelTurnOptions, ModelTurnRequest } from '../contracts.js';
import { type Frame } from './context.js';
import type { Platform } from './platform.js';
import type { IterationStatisticsStore, ProgressJudgeFunction } from './iterate.js';
import type { CallStoreLike } from '../calls/recorder.js';
import { CompilationCache } from '../calls/compilations.js';
import { RefinementChecker, type RefinementJudge, type RefinementSettings, type VerdictCache } from '../native/refinement.js';
import { ModelBudget } from '../native/model-budget.js';
/** How far stored compilations may serve calls: not at all, compared in the background only, or served. */
export type SpecializationMode = 'off' | 'shadow' | 'on';
export type ModelDriver = ((request: ModelTurnRequest, signal?: AbortSignal, options?: ModelTurnOptions) => Promise<ModelTurn> | ModelTurn) & {
    /**
     * Optional decision readout (`DecisionScorer`, contracts.ts): score a finite set of replies instead of generating one.
     * Any driver may carry it; without it, or when it fails with `decision-unsupported`, a finite readout generates one offered JSON value on the same short decision prompt.
     */
    decide?: DecisionScorer;
    /** The backend's complete native store, reader identity and available writer; wrappers retain this binding. */
    neuraleseRuntime?: () => Promise<import('../native/neuralese.js').NeuraleseRuntimeOptions | undefined>;
    /**
     * The backend continues a reply cut off at its length limit (`ModelTurnRequest.continue`): the agent loop resumes a
     * cut reply where it stopped instead of starting a new turn. The managed llama.cpp server does (assistant prefill).
     */
    continuesReplies?: boolean;
};
export type ModelConfig = {
    driver: ModelDriver;
    promptRendering?: import('../native/system-prompts.js').PromptRendering;
    /** Model identity and revision, recorded in execution-graph manifests (spec/NEURALESE_GRAPH.md). */
    id?: string;
    revision?: string;
    maxTurns?: number;
    maxTokens?: number;
    turnTokens?: number;
    temperature?: number;
    maxSeconds?: number;
    /** Context budget in prompt tokens before old tool outputs are elided (default: the context window the model server reports, less an eighth for the reply; 16384 when it does not say; null never compacts). */
    contextTokens?: number | null;
    /** Failed evals or rejected tool calls in a row before the call stops; unlimited unless set. */
    maxFailureRepairs?: number;
    /** `finite-returns`: every call with a finite result type uses the decision readout when the driver can score
     * replies; `declared` (default): only functions whose frontmatter says `readout: decision`. */
    decisionReadout?: 'declared' | 'finite-returns';
    /** Explicit diagnostic opt-out from JSON generation when scoring is unavailable. */
    decisionGeneration?: 'json' | 'tool-loop';
    /** Reasoning samples per `readout: decision` call before its values are scored (default 4, NATLANG_DECISION_SAMPLES;
     * 1 at temperature 0); 0 reads every decision out without reasoning, as `readout: instant` does. */
    decisionSamples?: number;
    /** Guided generation (the `guidance` request field) on natlang's reference server and the llama.cpp fork (managed and in
     * the page). A configured runtime (`natlang run`, natlangRuntime()) turns it on for those backends unless the profile's
     * `runtime.guidance` says otherwise; set directly, it is off unless given. Other backends ignore the field. */
    guidance?: boolean | {
        repeat?: number;
        syntax?: boolean;
        retries?: number;
        tools?: string[];
    };
};
/** One natlang invocation's trace, delivered to the runtime's trace sink when the invocation ends. */
export type InvocationTrace = {
    callId: string;
    parentCallId: string | null;
    taskId: string;
    adaptation?: Record<string, unknown>;
    definitionId: string;
    name: string;
    outcome: string;
    detail: string;
    events: Record<string, unknown>[];
};
/** Receives each invocation's complete trace when it ends. A sink with `stream` also sees the trace as it grows (`events`
 * is the whole list so far), so a process that is stopped mid-call still leaves the calls it had in flight. */
export type TraceSink = ((trace: InvocationTrace) => void) & {
    stream?(callId: string, events: readonly Record<string, unknown>[]): void;
};
/**
 * A live event of a running task (plans/STREAMING.md §1.6), delivered while it happens so a host can show a natlang
 * function at work. `model_delta`: a piece of one of the call's model turns as it streams (`ModelTurnDelta`), tagged
 * with the call (`callId`, the caller's `parentCallId`, the function's `name` and `definitionId`) and the turn
 * (`turn`, the number its `model_request` trace events carry). A `reset` delta means the turn's request is sent
 * again: discard what the call's turn showed so far. Live events are hints: the call's trace and records are
 * unchanged by them, and a turn its driver received whole has none.
 */
type LiveCall = {
    taskId: string;
    callId: string;
    parentCallId: string | null;
    definitionId: string;
    name: string;
};
/** A call's progress as it happens: model deltas, its start and end, and its trace events (`event.kind`: model_request,
 * action, scope_failure, model_incomplete, ...; scope snapshots are left out). */
export type LiveEvent = (LiveCall & {
    type: 'model_delta';
    turn: number;
    delta: ModelTurnDelta;
}) | (LiveCall & {
    type: 'call_start';
}) | (LiveCall & {
    type: 'call_end';
    outcome: string;
    detail: string;
}) | (LiveCall & {
    type: 'trace';
    event: Record<string, unknown>;
});
/** Receives live events synchronously as they occur; it must be quick, and what it throws is ignored. */
export type LiveSink = (event: LiveEvent) => void;
/** A decision with its distribution (`runtime.decide`): every allowed value's probability, highest is `value`. For a
 * `readout: decision` call a probability is the model's chance of answering with that value after reasoning first:
 * the mean, over `reasoned` reasoning samples, of the value's softmax after each; for `readout: instant` it is the
 * softmax of the values scored without reasoning. */
export type Decision<T> = {
    value: T;
    probabilities: {
        value: T;
        probability: number;
    }[];
    confidence: number;
    scored: boolean;
    /** The reasoning samples the probabilities average over; absent when the call read out without reasoning. */
    reasoned?: number;
    /** A record decision: per field, each of its values and its probability (the marginal when the records were scored
     * together; the step's distribution, given the fields chosen before it, when they were scored field by field). */
    fields?: Record<string, {
        value: unknown;
        probability: number;
    }[]>;
};
export type NatlangLimits = {
    maxEpisodes?: number;
    maxDepth?: number;
    maxActions?: number;
    maxToolCalls?: number;
    /** Total model requests and completion tokens across this task's complete invocation graph. */
    maxModelRequests?: number;
    maxModelTokens?: number;
    /** Wall-clock limit for one task. */
    timeoutMs?: number;
};
export type Services = Record<string, object>;
export type NatlangRuntimeOptions = {
    /** Join accepted Native operations before invocation completion (default true). */
    settleNativeEffects?: boolean;
    /** Set false to retain legacy runtime-only handling of unknown eval names. Service scopes stay enforced. */
    checkEvalBindings?: boolean;
    /** Check unresolved asynchronous values before reading their result fields (default true). */
    checkAwaitedFields?: boolean;
    /** Account for speculative source edits in the current task. */
    onFolderProposal?: () => void;
    program?: ProgramDescriptor;
    adaptation?: AdaptationBinding | null;
    /** Tuned weight releases (`natlang tune`), one per program. A function is read at each task creation, so a newly
     * activated release serves new tasks while running tasks finish on the one they pinned. */
    weights?: readonly WeightBinding[] | (() => readonly WeightBinding[]);
    /** Exact stored native guidance emitted by the memetic guidance exporter: one binding, or a list of scoped bindings
     * of one program (each call imports its function's binding, else the program-wide one). */
    nativeProgramGuidance?: ProgramGuidanceInput;
    /** Text program guidance (program-wide and/or per-function, e.g. from `guidance.json` in `natlang improve DIR`). */
    programGuidance?: AuthoredTextGuidance | {
        program?: string;
        functions?: Record<string, string>;
        programId?: string;
    };
    executorIdentity?: ExecutorIdentity;
    isolateModules?: boolean;
    signal?: AbortSignal;
    evaluation?: {
        id: string;
        caseId: string;
        replicate: number;
    };
    codeEdits?: 'allow' | 'deny';
    model?: ModelDriver | ModelConfig;
    /**
     * Further models by name. A named function whose frontmatter says `model: NAME` runs on this one (a small model
     * for judgments, a large one for authoring); without an entry of that name it runs on `model`.
     */
    models?: Record<string, ModelDriver | ModelConfig>;
    /** Ordered, explicitly named model profiles available for a live invocation handoff. */
    escalation?: {
        models: string[];
        enabled?: boolean;
    };
    /** Drive interpreter sessions directly instead of through a model (fixtures, replay, tests). */
    agent?: import('../native/runtime.js').NativeAgent;
    /**
     * The model driver behind `agent` (the teacher collector's policy or teacher, a scripted replay). With no `model`,
     * refinement judges score with its `decide`, else a `holds` call runs through `agent`; without it there is no judge.
     */
    agentDriver?: {
        decide?: DecisionScorer;
        model?: unknown;
        name?: string;
    };
    /** Typed host services, available to callable-folder code via `natlang:services` and to eval as named bindings. */
    services?: Services;
    /**
     * What the model is shown of each service: TypeScript declarations of its members with doc comments (a `.d.ts`
     * body of `export` declarations, or a whole `declare namespace name { … }`). The model can read them with
     * read_code; without one a service is listed by its method names only.
     */
    serviceDeclarations?: Record<string, string>;
    /** Services only some functions may use, by each function's source path (`review/assess.nl`); see SPEC. */
    serviceScopes?: Record<string, string[]>;
    trace?: TraceSink;
    /** Live events of every task (`LiveEvent`); without a subscriber the runtime does no live work. */
    onLive?: LiveSink;
    /**
     * Exact host-only invocation I/O capture. Inputs use the named source allowlist;
     * captureAllOutputs explicitly includes arbitrary inline/named return values. Disabled
     * unless configured; no model-visible context or execution state changes.
     */
    exactHostTraceCapture?: {
        definitionSources: string[];
        inputArguments: string[];
        captureOutput?: boolean;
        captureAllOutputs?: boolean;
        maxBytes: number;
    };
    /**
     * Host-only scoring evidence: each call of a program's TypeScript function records the `stableHash` of its result as a
     * `step_state` trace event (no node, so not part of the execution graph), so a plain loop over a step function shows
     * the states an `iterateOn` trace would. Off unless a scorer asks (the collector, for iteration stop markers).
     */
    traceStepStates?: boolean;
    limits?: NatlangLimits;
    seed?: {
        mode: 'derived' | 'backend';
        root?: number;
    };
    /**
     * What this runtime runs on (runtime/platform.ts): context propagation, the evaluator, the call store, platform modules.
     * Required by the kernel; `@natlang/node` and `@natlang/browser` supply their own when it is omitted.
     */
    platform?: Platform;
    /** Evaluator factory; the platform's evaluator by default. */
    environment?: () => EvalEnvironment;
    /** Directory whose node_modules eval imports resolve from (Node; default: the nearest package.json above cwd). */
    workspace?: string;
    /** Allow `fetch` in eval (default: true). */
    network?: boolean;
    /** Extra system prompt text appended for every invocation. */
    /** Application instructions appended to the shared runtime prompt. */
    systemPrompt?: string | (() => string);
    statistics?: IterationStatisticsStore;
    progressJudge?: ProgressJudgeFunction;
    /** Tensor store and write port for Neuralese values (S0 §3). Without it, soft literals fail the call. */
    neuralese?: import('../native/neuralese.js').NeuraleseRuntimeOptions;
    /** Law-based combinator rewrites and their measurements (spec/NEURALESE_REWRITES.md); every rule is off without it. */
    rewrites?: import('../compiler/rewrites.js').RewriteGate;
    /** Fused hand-offs between functions (plans/FUSED_PIPELINES.md); absent or mode `off`, every hand-off is text. */
    fusion?: import('./fusion.js').FusionOptions;
    /**
     * The call record store (plans/TRACE_SPECIALIZATION.md): every call is recorded there and served from its
     * compilations. Default: the platform's (Node: the machine's store, `$NATLANG_CALL_STORE`); `false` records nothing.
     */
    calls?: CallStoreLike | false;
    /** The program's directory on this machine, recorded with each call so offline work can reload its definitions. */
    programRoot?: string;
    /** The program's `recording` settings (`natlang.json`): definitions (`dir/*.nl`) or arguments (`name.arg`) recorded by type only. */
    recording?: {
        exclude?: string[];
        checkpoints?: boolean;
        nativeRoots?: boolean;
    };
    /** How far compilations may serve this runtime's calls; the machine setting bounds it (default: the machine setting). */
    specialization?: SpecializationMode;
    /** The tiered execution engine (plans/TIERED_ENGINE.md): functions it names run on a ladder of tiers. Absent: no change. */
    tiers?: import('../calls/tiers.js').TierEngine;
    /**
     * Refinement checking for `Is<T, "predicate">` types (natlang.json `refinements`, plans/REFINEMENT_TYPES.md): the
     * threshold, uncertainty band and policy; `cache` holds verdicts by content (in memory by default) and `crisp`
     * maps a predicate to a checker that decides it (`undefined` defers to the judge).
     */
    refinements?: RefinementSettings & {
        cache?: VerdictCache;
        crisp?: Record<string, (value: unknown) => boolean | undefined>;
    };
    /**
     * Natlang compiler runtime hooks (`plans/NATLANG_COMPILER.md` §6), off unless set:
     * - `compiledDecisions`: per definition (id or name), a calibrated single-pass `readout: decision`: the options are
     *   scored once at `temperature`; a choice at or above `fastThreshold` (and no other option at its risk floor)
     *   settles without reasoning samples, anything else takes the ordinary reasoned readout.
     * - `branchSearch`: prefix-shared `branch@N` per tool-loop turn, ranked crisp checks first, then the step verifier.
     *   The kept turn is a selection over samples, not one sample of the policy: not for on-policy collection.
     * - `hoistContracts`: hoist deterministic structural return-type directives into the call's opening notes on pass 1.
     * - `jit`: live Tier-1 JIT compiler controller binding BOTH compiled adapter and compiled soft instruction state
     *   into the invocation frame when no static tuned weight release is already bound.
     * Promoted crisp fast paths emit standard `cases.ts` modules for `runCrispCase` (`tune/crisp-promote.ts`).
     */
    compiler?: {
        compiledDecisions?: ReadonlyMap<string, {
            temperature: number;
            fastThreshold: number;
            riskThresholds?: Readonly<Record<string, number>>;
        }>;
        branchSearch?: import('../native/branch-search.js').BranchSearchOptions;
        hoistContracts?: boolean;
        jit?: {
            cache: import('./jit.js').CompiledSiteCache;
            compilerSha: string;
            policySha: string;
            baseGgufSha256?: string;
            compile: (args: {
                siteId: string;
                resolvedHeaderText: string;
                partialArgsJson?: string;
            }) => Promise<{
                adapterId: string | null;
                nativeStateId: string | null;
            }>;
        };
    };
};
export type TaskOptions = {
    /** Set false for an intentionally independent trace. A nested run otherwise links only its causal caller, never its authority or task lifetime. */
    traceParent?: boolean;
    program?: ProgramDescriptor;
    adaptation?: AdaptationBinding | null;
    /** Pin these weight releases instead of the runtime's current ones. */
    weights?: readonly WeightBinding[];
    services?: Services;
    serviceDeclarations?: Record<string, string>;
    nativeProgramGuidance?: ProgramGuidanceInput;
    programGuidance?: AuthoredTextGuidance | {
        program?: string;
        functions?: Record<string, string>;
        programId?: string;
    };
    serviceScopes?: Record<string, string[]>;
    signal?: AbortSignal;
    trace?: TraceSink;
    name?: string;
    /** Live events of this task (`LiveEvent`), besides the runtime's `onLive`. */
    onLive?: LiveSink;
    /** Compilations for this task's calls (an audit or replay runs with `off`). */
    specialization?: SpecializationMode;
    /** Set on an audit run: the call whose inputs it re-runs through the agent. */
    auditOf?: string;
};
/** Host setup failed before a program could execute; this is not a model task outcome. */
export declare class NatlangPlatformUnavailableError extends Error {
    readonly code = "natlang-platform-unavailable";
    constructor();
}
/** An ordinary TypeScript task in which natlang functions can be called. */
export declare class NatlangTask {
    readonly runtime: NatlangRuntime;
    private traceParent?;
    readonly id: string;
    readonly services: Services;
    readonly serviceDeclarations: Record<string, string>;
    readonly serviceScopes: Record<string, string[]>;
    readonly signal: AbortSignal;
    readonly episodeBudget: {
        limit?: number;
        used: number;
    };
    readonly modelBudget: ModelBudget;
    readonly traces: InvocationTrace[];
    private readonly executionOccurrenceCounts;
    readonly programView: ProgramView;
    /** The weight releases pinned at creation; every call of this task, inner calls included, resolves from these. */
    readonly weights: readonly WeightBinding[];
    readonly nativeProgramGuidance?: ProgramGuidance;
    readonly authoredProgramGuidance?: AuthoredTextGuidance | {
        program?: string;
        functions?: Record<string, string>;
        programId?: string;
    };
    readonly specialization?: SpecializationMode;
    readonly auditOf?: string;
    /** The last failed call per caller and definition revision, so a retry can be recorded against it. */
    readonly failedCalls: Map<string, string>;
    readonly moduleInstances: WeakMap<import("./loader.js").ModuleRecord, {
        exports: Record<string, unknown>;
        ready: boolean;
    }>;
    private readonly pending;
    private readonly cleanups;
    /** Register a task-owned native resource; released exactly once at task close. */
    onClose(cleanup: () => void): () => void;
    private readonly pendingChildren;
    track<T>(call: Promise<T>, parentCallId?: string): Promise<T>;
    /** The child calls of an invocation that are still running. */
    pendingChildCalls(parentCallId: string): Promise<unknown>[];
    drainChildren(parentCallId: string): Promise<void>;
    hasPendingChildren(parentCallId: string): boolean;
    drain(): Promise<void>;
    private readonly abort;
    private callSequence;
    private effectSequence;
    private readonly graphChildrenByParent;
    private readonly liveInvocations;
    private readonly effectObservers;
    /** Invocation liveness is shorter than task lifetime; recorded spans additionally own durable call custody. */
    beginInvocation(callId: string, recorded?: boolean): void;
    markInvocationRecorded(callId: string): void;
    endInvocation(callId: string): void;
    isInvocationActive(callId: string): boolean;
    isInvocationRecorded(callId: string): boolean;
    /** Observation belongs to the current invocation, independently of lexical service authority. */
    setInvocationEffectObserver(callId: string, observe: (event: EffectEvent) => unknown): void;
    invocationEffectObserver(callId: string): ((event: EffectEvent) => unknown) | undefined;
    private readonly closureTraceParents;
    /** Associations are keyed by actual parent identity, never a mutable ambient parent slot. */
    retainClosureTraceParent(parent: Frame): void;
    private traceParentFor;
    isExternalTraceParent(callId: string): boolean;
    activeTraceParent(callId: string): Frame | undefined;
    /** Allocate a task-wide order at the actual service request boundary. */
    nextGraphEffectOrder(): number;
    registerGraphCall(callId: string, parentId: string | null | undefined): void;
    discardGraphCall(callId: string, parentId: string | null | undefined): void;
    graphChildren(callId: string): string[];
    private readonly definitionCalls;
    private readonly taskOrdinal;
    definitionSeedId(key: string): string;
    private closed;
    private timer?;
    private appPromptSnapshot?;
    constructor(runtime: NatlangRuntime, options?: TaskOptions, traceParent?: Frame | undefined);
    private readonly traceSink?;
    /** The task's live subscribers (task and runtime `onLive`), undefined when there are none. */
    readonly live?: LiveSink;
    /** How far compilations may serve this task's calls: the machine, runtime and task settings, whichever is lowest. */
    specializationMode(): SpecializationMode;
    get frame(): Frame;
    nextCallId(): string;
    reserveExecutionSiblingOrdinal(parentCallId: string | undefined, definitionId: string): number;
    checkOpen(): void;
    record(trace: InvocationTrace): void;
    /** Hands a running invocation's events to the trace sinks that stream (TraceSink.stream). */
    streamTrace(callId: string, events: readonly Record<string, unknown>[]): void;
    /** Whether any trace sink streams, so the kernel observes traces only when someone writes them as they grow. */
    get streamsTraces(): boolean;
    environment(): EvalEnvironment;
    /** Refinement events with no call to carry them (`refine`/`assume` in host code outside any natlang call). */
    readonly refinementEvents: {
        kind: string;
        data: Record<string, unknown>;
    }[];
    /** The refinement checker of this task's runtime: shared settings and verdict cache. */
    refinementChecker(): RefinementChecker;
    /**
     * The judge and the escalation judge for a call running on `model`: the configured `refinements.judge` model when
     * there is one, else the call's own. A task driven by `agent` with no model judges on the agent's driver
     * (`agentDriver`): its scorer, else `holds` through the agent. Undefined when there is neither.
     */
    refinementJudges(model: ModelConfig | undefined, frame?: Frame): {
        judge?: RefinementJudge;
        escalation?: RefinementJudge;
    };
    model(name?: string): ModelConfig | undefined;
    systemPrompt(): string;
    cancel(reason?: unknown): void;
    get isClosed(): boolean;
    close(): void;
}
/** Project-level natlang runtime: model, services, trace sink, limits. Create tasks with `run`. */
export declare class NatlangRuntime {
    readonly options: NatlangRuntimeOptions;
    private closed;
    private store?;
    private compiled?;
    /** The call record store this runtime records to, if any. */
    callStore(): CallStoreLike | undefined;
    private refinements?;
    /** The checker for `Is<T, P>` slots, with this runtime's settings, crisp checkers and verdict cache. */
    refinementChecker(): RefinementChecker;
    /** Loaded compilations of this runtime's store. */
    compilations(): CompilationCache | undefined;
    /** What this runtime runs on. */
    readonly platform: Platform;
    constructor(options?: NatlangRuntimeOptions);
    /**
     * The dialect this runtime's model reads and writes, which `Neuralese<T>` (`DefaultDialect`) names: the configured
     * `neuralese.dialect`, else the write port's; null for a text-only runtime. A host checks it at startup against what
     * its consumers read (a Neuralese server's `/v1/neuralese/info` dialects), so a mismatch is found before a request.
     */
    readerDialect(): string | null;
    /** Run `fn` as a natlang task. Natlang functions called anywhere inside it use this runtime. */
    run<T>(fn: () => T | Promise<T>, options?: TaskOptions): Promise<T>;
    /**
     * Call a natural-language function with a finite result type and return its answer with the probability of every
     * allowed value, so code can act on confidence (escalate below a floor, ask before an irreversible step). The
     * probabilities come from the decision readout (`readout: decision`, or `decisionReadout: 'finite-returns'`); when
     * the call did not score (no readout, or a backend that cannot score), the answer has probability 1 and `scored`
     * is false.
     */
    decide<A extends unknown[], T>(fn: (...args: A) => Promise<T>, ...args: A): Promise<Decision<T>>;
    /** Retain lexical task authority while resolving causal ancestry at each callback invocation. */
    bind<F extends (...args: never[]) => unknown>(fn: F): F;
    close(): void;
}
export declare function createNatlangRuntime(options: NatlangRuntimeOptions & {
    platform: Platform;
}): NatlangRuntime;
/**
 * Call fn in frame and return its answer with the distribution its decision readout scored: runtime.decide on the
 * host, decide(...) in eval. Without a scored readout the answer has probability 1 and `scored` is false.
 */
export declare function decideInFrame<A extends unknown[], T>(frame: Frame, fn: (...args: A) => Promise<T>, args: A): Promise<Decision<T>>;
/** Resolve a closure's lexical authority separately from its current causal caller.
 * A completed creator is not an active parent. An authenticated external caller
 * lends causal identity and graph ownership, never lexical service grants.
 */
export declare function resolveBoundFrame(owner: Frame): Frame;
/** Resolve the frame for a natlang call: the propagated frame, the creation frame, or the only active task. */
export declare function resolveFrame(created?: Frame): Frame;
export { recordingServices } from '../native/effects.js';
