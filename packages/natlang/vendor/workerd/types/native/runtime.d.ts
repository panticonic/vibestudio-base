import { type InlineInstructionOrigin } from '../runtime/lowered.js';
import { type EvalEnvironment, type HostEvent } from './evaluator.js';
import { PageStore } from './pages.js';
import { type EffectEvent } from './effects.js';
import { TypeEnv, type Type } from './types.js';
import { type LambdaNode, type Value } from './values.js';
import { NativeTraceRecorder } from './trace.js';
import { UntrustedRegistry } from './untrusted.js';
import type { InlineLambdaPlan, NatlangDiagnostic } from '../compiler/inline.js';
import { type NeuraleseRuntimeOptions } from './neuralese.js';
import { type Frame } from '../runtime/context.js';
import { type ItemRecord } from '../runtime/loader.js';
import { type ReturnErrorText } from './return-errors.js';
/** Services the invocation kernel provides to an interpreter run. */
export type NativeRuntimeHooks = {
    /** Callable tree for a codebase record tree (functions with child attributes and `iterateOn`). */
    callables(codebase: Record<string, unknown>, session: NativeSession): Record<string, unknown>;
    /** Create an inline natlang callable from an eval plan. */
    inline(session: NativeSession, plan: InlineLambdaPlan, values: unknown[], accessors: Record<string, unknown>, origin?: InlineInstructionOrigin): unknown;
    iterateOn(session: NativeSession, step: unknown, initial: unknown, ...args: unknown[]): unknown;
    finite(source: unknown, label?: string): unknown;
    finiteArrayIterator(source: unknown, method: 'entries' | 'keys' | 'values', label?: string): unknown;
    finiteAsync(source: unknown, label?: string): unknown;
    guard(id: string, fn: () => unknown, args?: readonly unknown[]): unknown;
    /** Type-checked analysis of `nl` in eval snippets. */
    analyze(session: NativeSession, source: string): {
        plans: InlineLambdaPlan[];
        diagnostics: NatlangDiagnostic[];
        neuralese?: import('../compiler/neuralese.js').NeuraleseLiteral[];
        readouts?: import('../compiler/neuralese.js').NeuraleseReadout[];
        instantiations?: import('../compiler/neuralese.js').GenericInstantiation[];
    };
    /** Reads of fields a value's declared type does not have, checked in every eval. */
    checkFields?(session: NativeSession, source: string): NatlangDiagnostic[];
};
export type NativeOutcome = {
    kind: 'done' | 'quiesced';
    detail: string;
    value?: Value;
};
/** A tool call's result. `entry` is its index in the session's transcript. */
export type NativeResult = {
    kind: string;
    text: string;
    value?: Value;
    codes?: string[];
    entry?: number;
};
export type NativeAgent = (session: NativeSession) => Promise<string | void> | string | void;
export type NativeRuntimeOptions = {
    environment: EvalEnvironment;
    hooks: NativeRuntimeHooks;
    agent?: NativeAgent;
    /** Sees each service call this runtime wraps, with its exact arguments and result (a standalone run's call record). */
    observeEffect?: (event: EffectEvent) => void;
    maxActions?: number;
    maxToolCalls?: number;
    /**
     * The root call's ID: unique per run (it keys the call record, its children's parent link and the trace). Without one a
     * fresh `native-run:<uuid>` is used. `runLabel` is the logical name shared by runs of one kind (`curriculum-reference`),
     * kept on the call record; derived seeds use `seedId`, else the label, else the run ID, so a unique ID leaves them as
     * they were under the shared name.
     */
    runId?: string;
    runLabel?: string;
    seedId?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
    exactHostTraceCapture?: {
        definitionSources: string[];
        inputArguments: string[];
        captureOutput?: boolean;
        captureAllOutputs?: boolean;
        maxBytes: number;
    };
    sourceRevision?: string;
    parentCallId?: string;
    /** Task frame of this invocation (task, caller chain, parent call). */
    frame?: Frame;
    /** Extra manifest fields recorded for this invocation. */
    manifest?: Record<string, unknown>;
    /** Host services, injected into eval as named bindings; their calls are recorded as effects (see effects.ts). */
    services?: Record<string, object>;
    /** Configured soft-value writer for exact typed result materialization. */
    neuralese?: NeuraleseRuntimeOptions;
    /**
     * Declarations of external services by name (see external.ts): what the model is shown of them, and what
     * read_code returns. Their implementations are not part of the program and cannot be read or edited.
     */
    declarations?: Record<string, string>;
    /**
     * Services only some functions may use, by the source path of each function (`answer_question/table_expert.nl`):
     * such a service is in scope in that function's calls and the calls they make, and nowhere else. Its declaration
     * stays readable everywhere; only its use is limited, as a specialist can reach systems its caller cannot.
     */
    serviceScopes?: Record<string, string[]>;
    sharedEpisodeBudget?: {
        limit?: number;
        used: number;
    };
    /** Wording of return_result's value rejections (native/return-errors.ts); default the platform's (Node: NATLANG_RETURN_ERROR_TEXT), then the adopted one. */
    returnErrorText?: ReturnErrorText;
    seedPolicy?: {
        mode: 'derived' | 'backend';
        root?: number;
    };
};
export declare const BUILT_IN_DOCS: Record<string, string>;
/**
 * The scope type of a portable value, as a local holding it is declared. A list or record that holds a live value is one
 * live value, unless `liveFields`: then it is typed field by field and only the live value itself is a live type (for a
 * host that reads the fields around a handle, such as an eval cell's `scope`).
 */
export declare function inferValueType(value: unknown, options?: {
    liveFields?: boolean;
}): string;
/** Find a codebase item by dotted path; module exports resolve to their module's source. */
export declare function findCodebaseItem(codebase: Record<string, unknown>, name: string): {
    path: string[];
    record: ItemRecord;
} | undefined;
/** The logical name of a run started without a run ID. */
export declare const DEFAULT_RUN_LABEL = "native-run";
/**
 * A run's identity: its unique root call ID and its logical name. A run without an ID gets a fresh one under the label
 * `native-run`.
 */
export declare function runIdentity(options: {
    runId?: string;
    runLabel?: string;
}): {
    runId: string;
    runLabel?: string;
};
/** What a run's derived seeds are keyed by: its seed ID, else its logical name, else its run ID (see `runIdentity`). */
export declare const runSeedKey: (options: {
    runId: string;
    runLabel?: string;
    seedId?: string;
}) => string;
export declare class NativeRuntime {
    readonly events: HostEvent[];
    readonly trace: NativeTraceRecorder;
    readonly options: {
        maxActions?: number;
        maxToolCalls?: number;
        runId: string;
        runLabel?: string;
        seedId?: string;
        parentCallId?: string;
        returnErrorText?: ReturnErrorText;
    };
    readonly seedPolicy: {
        mode: 'derived' | 'backend';
        root?: number;
    };
    readonly environment: EvalEnvironment;
    readonly agent?: NativeAgent;
    readonly episodeBudget: {
        limit?: number;
        used: number;
    };
    frame?: Frame;
    readonly displayLiveId: (value: object) => number;
    /** Where untrusted text came from; shared by the calls of one task (native/untrusted.ts). */
    readonly untrusted: UntrustedRegistry;
    readonly hooks: NativeRuntimeHooks;
    readonly services: Record<string, object>;
    readonly neuralese?: NeuraleseRuntimeOptions;
    readonly declarations: Record<string, string>;
    readonly serviceScopes: Record<string, string[]>;
    currentCallId?: string;
    private root?;
    private lastObserved?;
    readonly signal?: AbortSignal;
    private readonly deadline?;
    private readonly exactHostTraceCapture?;
    constructor(options: NativeRuntimeOptions);
    checkInterruption(): void;
    /** Lift only an ordinary string supplied directly to a declared Neuralese<string> parameter. */
    materializeSoftStringArguments(definition: {
        params: {
            name: string;
            type: string;
        }[];
        types: Record<string, string>;
    }, inputs: readonly unknown[], parentCallId?: string): Promise<unknown[]>;
    /** Shared, graph-recorded text block writer for typed result and typed argument boundaries. */
    writeNeuraleseText(text: string, wanted: Type, metadata: {
        sourceKind: 'typed-text-result' | 'typed-json-result' | 'typed-text-result-field' | 'typed-text-argument';
        source: string;
        markerContext: string;
        inputs: readonly {
            node: string;
            port?: string;
        }[];
        resultPath?: (string | number)[];
        argumentName?: string;
    }): Promise<Value>;
    evaluate(node: LambdaNode, code: string, scope: Record<string, unknown>, live: Record<string, unknown>, timeoutMs?: number, signal?: AbortSignal): Promise<import("./evaluator.js").EvalResult>;
    private recordHostEvents;
    /**
     * The graph fields of an invocation's start event (spec/NEURALESE_GRAPH.md): definition and revision, context,
     * signature, capture bindings, and argument references (soft arguments by block and producer).
     */
    private invocationNode;
    /** Run one invocation to completion or quiescence. */
    run(node: LambdaNode): Promise<{
        outcome: NativeOutcome;
        value: Value;
    }>;
    private captureExactInputs;
    private captureExactValue;
    observeState(phase: string, outcome?: string): void;
    private stateSummary;
    private quiesce;
    private episode;
}
export type ScopeFailureDebug = {
    version: 'natlang.scope_failure/1';
    serial: number;
    kind: 'compile' | 'runtime' | 'boundary';
    message: string;
    code: string;
    scope: Record<string, unknown>;
    trace: Record<string, unknown>[];
    diagnostics: Record<string, unknown>[];
    logs: string[];
    stack?: string;
};
/** Longest note compact_history accepts. */
export declare const COMPACTION_NOTE_CHARS = 2000;
/**
 * One earlier tool call of this call: the reasoning that led to it, its arguments, its outcome (`status`, the result kind: ok, rejected, error,
 * completed, ...), for eval the returned value as data (`value`, when it is portable data of modest size) and what it
 * printed (`console`), and the full text the model was shown (`output`, nothing cut off).
 */
export type TranscriptEntry = {
    turn: number;
    tool: string;
    code?: string;
    arguments: Record<string, unknown>;
    status: string;
    value?: unknown;
    console?: string;
    output: string;
    /** The model's reasoning in the turn that made this call (on the turn's first call only). */
    reasoning?: string;
};
/**
 * What evals see as `transcript`: the call's history, searched rather than read through. There is no array access
 * or iteration, and printing it shows a summary; `search` finds lines, `entry(n)` gives one call in full.
 */
export declare class TranscriptView {
    #private;
    constructor(entries: readonly TranscriptEntry[]);
    get length(): number;
    /**
     * Lines of earlier reasoning, code, and outputs that match: a case-insensitive text, or a regular expression (an empty text
     * matches every line). Each match is { entry, turn, tool, in, line }, the line cut to 200 characters around the
     * match; at most `limit` (default 20). `status` and `tool` restrict the calls searched, e.g. { status: 'error' }.
     */
    search(query: string | RegExp, options?: {
        in?: 'output' | 'code' | 'reasoning' | 'all';
        limit?: number;
        status?: string;
        tool?: string;
    }): readonly {
        entry: number;
        turn: number;
        tool: string;
        in: "output" | "code" | "reasoning";
        line: string;
    }[];
    /** One earlier call in full; negative numbers count from the end (entry(-1) is the latest). */
    entry(n: number): TranscriptEntry;
    toString(): string;
    toJSON(): string;
}
export declare class NativeSession {
    readonly runtime: NativeRuntime;
    readonly lam: LambdaNode;
    readonly env: TypeEnv;
    completed: boolean;
    /**
     * Judges the refined slots (`Is<T, P>`) of a value before the session accepts it as the result or as a local. Set by
     * the agent loop (native/agent.ts); a failure is `{ code, message }` and is reported to the model like a type error.
     */
    refinementCheck?: (value: Value, type: Type, path: string) => Promise<{
        code: string;
        message: string;
    } | undefined>;
    actions: number;
    toolCalls: number;
    readonly surfaceName = "scope-eval-v2";
    failureSerial: number;
    failureDebug?: ScopeFailureDebug;
    private readonly scopeLocalMutability;
    private readonly explainedNaturalFunctions;
    private readonly originalSources;
    private readonly skillReads;
    private callableCache?;
    /** Output cut off in this call's tool results, readable with read_page. */
    readonly pages: PageStore;
    /** This call's tool calls with their full outputs, in order; evals see it through a TranscriptView. */
    readonly transcript: TranscriptEntry[];
    /** The model turn the next recorded call belongs to (set by the agent). */
    turn: number;
    /** The model's reasoning in that turn, recorded with the turn's first call (set by the agent). */
    turnReasoning?: string;
    /** What the eval being recorded returned and printed, for its transcript entry. */
    private evalDetail?;
    /** Texts the current call's result shows cut off, with their full versions for its transcript entry. */
    private cuts;
    /** Types this call's evals declared (`type X = …`, `interface X { … }`), by name. */
    private localTypes;
    /** Authenticated source for top-level helpers from successful evals; never stores closures or host handles. */
    private readonly persistentScopeHelpers;
    /** Exact native tool schemas offered by NativeToolAgent for this call's current turn. */
    private readonly offeredToolDocs;
    private activeScopeLocals?;
    constructor(runtime: NativeRuntime, lam: LambdaNode, env: TypeEnv);
    executionOccurrence(): import('../contracts.js').NativeExecutionOccurrence | undefined;
    /**
     * Records where the strings of this call's `Untrusted<...>` arguments and captured variables came from, so the renderer
     * shows them as data (native/untrusted.ts). A text already known keeps the source that first named it (a service).
     */
    markUntrusted(): void;
    rememberOfferedTools(tools: readonly unknown[]): void;
    private toolDocumentation;
    /** Whether the model declared this persistent local with let (true) or const. */
    localMutable(name: string): boolean;
    /** Type aliases from prior evals, made visible to the next eval's inline signature analysis. */
    analysisTypeAliases(): Record<string, string>;
    private captureScopeFailure;
    /**
     * A final reply's text as the result when the declared return type accepts it. Neuralese<string> text goes through
     * the typed block writer; a bare "done" asks for the already staged value.
     */
    acceptTextResult(text: string): Promise<boolean>;
    /** Complete the invocation if an eval has returned a value of the declared type. */
    finish(): boolean;
    /** A text of the current call's result as it fits in a message; all of it goes to the call's transcript entry. */
    private show;
    /** A value of the current call's result, cut by structure; all of it goes to the call's transcript entry. */
    private showValue;
    private record;
    private actionLimitReached;
    /** The session's callable tree, rebuilt when a codebase edit publishes a new revision. */
    callables(): Record<string, unknown>;
    private writeNeuraleseResult;
    /** Materialize plain text or validated JSON only when the declared Neuralese element type makes that representation exact. */
    private coerceReturn;
    /** Apply one tool call. */
    applyAsync(name: string, args: Record<string, unknown>, toolCallId?: string): Promise<NativeResult>;
    private folderCommandCallable;
    /** A folder tool the platform provides (Node and browsers do; the workerd core does not), or why the call cannot have it. */
    private folderTool;
    private pythonHost;
    private editorTool;
    /** Synchronous tools (no eval). */
    apply(name: string, args: Record<string, unknown>): NativeResult;
    private scopeTool;
    /** The services this call may use: all but those scoped to functions it is not running within. */
    /** What eval code in this call can use, for a model looking for something it does not have. */
    private scopeGuide;
    availableServices(): Record<string, object>;
    /** read_code, edit_code, diff_code over the codebase record tree. */
    private functionTool;
    /** File tools for directory reducers, over the private folder copy. */
    private fileTool;
    private inferScopeType;
    /** Preserve a source-backed callable signature when it uses types visible in this call's scope. */
    private sourceCallableType;
    private scopePath;
    /** Static type of an initializer expression, for locals declared without an annotation. */
    private scopeInitializerType;
    /** Portable snapshot of the scope for failure debugging. */
    private scopeSnapshot;
    /** Whether this call's scope can hold soft values, so eval code is always checked for their opacity. */
    private holdsNeuralese;
    /** Execute one eval action as an atomic scope transaction. */
    private evaluate;
    private resolve;
    private descend;
}
/**
 * The type aliases of the callable items a call can use: the types its function listing shows. A name
 * that two items define differently is left out, since neither definition is the one in scope.
 */
export declare function callableTypes(codebase: Record<string, unknown>): Record<string, Type>;
