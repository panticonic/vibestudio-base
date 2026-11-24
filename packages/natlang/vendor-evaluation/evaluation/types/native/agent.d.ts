import { type AuthoredTextGuidance, type ProgramGuidance } from '../guidance/program.js';
import type { Type, TypeEnv } from './types.js';
import type { Value } from './values.js';
import { type NativeSession } from './runtime.js';
import type { DecisionScorer, ModelTurn, ModelTurnDelta, ModelTurnOptions, ModelTurnRequest } from '../contracts.js';
import { type FileToolSurface } from './prompt.js';
import { type Folder } from './scoped-fs.js';
import type { TrainingGuidance } from './training-guidance.js';
import { type PluggableSetting } from '../runtime/pluggable.js';
import { type UntrustedRegistry } from './untrusted.js';
import { type NeuraleseRuntimeOptions } from './neuralese.js';
import { type RefinementChecker, type RefinementFailure, type RefinementJudge } from './refinement.js';
import { type PromptRendering } from './system-prompts.js';
import type { ModelBudget } from './model-budget.js';
/** The code tools, as offered. Kept here so data collected under earlier wording can be migrated to it exactly. */
export declare const READ_CODE_DESCRIPTION: string;
export declare const EDIT_CODE_DESCRIPTION: string;
/**
 * The finishing tool. The last sentence is for judgments: asked "does review recommend the product?", a model answered
 * "it does not" with status blocked, and the caller got an error for a perfectly good answer.
 */
export declare const RETURN_RESULT_DESCRIPTION: string;
/** The finishing tool's description before its sentence on negative answers; kept for migrating collected data. */
export declare const RETURN_RESULT_DESCRIPTION_BEFORE: string;
/** Named in every opening, so a model that looks for them knows they exist and where their documentation is. */
/** NatlangContext (fn.in(context) in eval) joined the list on 2026-11-23; NATLANG_PROMPT_REVISION=2026-11-22 keeps the old line. */
export declare const BUILT_INS_LINE: string;
/** A call whose codebase is too large to read through (largeCallableScope) is also told of search_code (2026-11-23); under
 * NATLANG_PROMPT_REVISION=2026-11-22 the line stays the old one. */
export declare const SEARCH_BUILT_INS_LINE: string;
/** Inline children have the same delegation tools as named calls. */
export declare const INLINE_BUILT_INS_LINE: string;
export declare const NL_DEPTH_LIMIT_BUILT_INS_LINE: string;
export declare const NL_DEPTH_LIMIT_SEARCH_BUILT_INS_LINE: string;
/**
 * What one call's opening message adds after its scope: the program's guidance, then the function-tools, folder and
 * nesting-limit paragraphs that apply to this call. The system prompt and tool list are the same for every call, so
 * every call's opening shares one cached prefix; this is the part that differs. The runtime and the rebuild of recorded
 * calls for training (native/serving-request.ts) both compose it here.
 */
export declare function callNotes(call: {
    guidance?: string;
    ownCode: boolean;
    allowAdHoc: boolean;
    rendering?: PromptRendering;
    folder?: {
        fileTools?: FileToolSurface;
        writable: boolean;
        withheld?: readonly string[];
    };
    /** The declared result type, when the result is a function (`(t: Ticket) => boolean`). */
    functionResult?: string;
}): string;
/** A call's opening message with its notes (callNotes) as the last paragraph. */
export declare const withCallNotes: (opening: string, notes: string) => string;
export declare const OPENING_THOUGHT = "I'll start by reading this call's arguments into the eval scope.";
export declare const FOLDER_THOUGHT = "Next I'll list the files in this call's folder.";
export declare const DIFF_CODE_DESCRIPTION = "Show the changes made to functions of the program's codebase in this call.";
/**
 * The tool list from stable to variable (plans/semantic-fp/02 R0): LFM3's template writes the tools into the system turn
 * after the system prompt, so every engine's prefix cache and the learner's prefix tree share a call's tool block only up
 * to its first tool that differs. The tools every call has come first (STABLE_TOOLS), then the ones a run or a call
 * shape adds (escalate, the code-editing tools, the file tools), then return_result, whose value schema is the call's
 * declared result. Before 2026-11-23 (NATLANG_PROMPT_REVISION=2026-11-22) the file and code-editing tools sat between
 * eval and compact_history, so calls of different shapes parted right after read_page or read_code.
 */
export declare const STABLE_TOOLS: readonly ["eval", "read_page", "read_code", "compact_history"];
export declare function orderedTools<T extends {
    function: {
        name: string;
    };
}>(tools: T[]): T[];
/** Assistant turns the model has taken, not counting the runtime's pre-filled scope calls. */
export declare function modelTurnsSoFar(messages: readonly Record<string, unknown>[]): number;
export type NativeModelDriver = ((request: ModelTurnRequest, signal?: AbortSignal, options?: ModelTurnOptions) => Promise<ModelTurn> | ModelTurn) & {
    /** Scripted host drivers may ask to route fixed answers by the actual native return contract. */
    readonly requiresResultContract?: boolean;
    /** Optional scored decision readout; without it finite calls generate one JSON choice. */
    decide?: DecisionScorer;
    /** The backend continues a cut-off reply (`ModelTurnRequest.continue`; runtime.ts `ModelDriver`). */
    readonly continuesReplies?: boolean;
    neuraleseRuntime?: () => Promise<NeuraleseRuntimeOptions | undefined>;
};
/**
 * The call's arguments as its caller gave them, as the opening eval's result shows them (read_inputs() returns
 * the same values in eval). A long value is cut off, and its name holds all of it; an argument the caller left out is undefined.
 */
export declare function inputsListing(session: NativeSession, views?: Readonly<Record<string, string>>): string;
/** One argument's line of the opening listing: its name, type and value as shown. */
export declare function listingLine(name: string, type: string, shown: string): string;
/**
 * The prompt size and context window a server states when it refuses a request as longer than its context, for the
 * servers we run: llama.cpp (`exceed_context_size_error` with `n_prompt_tokens`, `n_ctx`) and vLLM ("maximum context
 * length is W tokens ... your prompt contains at least P input tokens", or "(P in the messages, C in the completion)").
 */
export declare function contextOverflow(message: string): {
    promptTokens: number;
    window: number | null;
} | undefined;
export declare function defaultContextBudget(driver: unknown): Promise<number>;
/**
 * Compaction: everything between the kept start (the opening, and the pinned note once there is one) and the latest
 * exchange (the last assistant turn and what followed it) leaves the conversation. It is all in transcript, and every
 * value the model stored is still in eval's scope. Returns how many messages were removed.
 */
export declare function collapseHistory(messages: Record<string, unknown>[], keptStart: number): number;
export declare function schemaOf(type: Type, env: TypeEnv, depth?: number): Record<string, unknown>;
/**
 * The one way a value is shown to the model: a TypeScript literal cut at item and field boundaries when it is long
 * (scopeExpression), or a preview when it has no literal form (live values). `holder` is where all of it is.
 */
export declare function renderValue(value: Value | unknown, options?: {
    holder?: string;
    budget?: number;
    root?: Folder;
    liveIdentity?: (value: object) => number;
    /** Where untrusted text came from; a string it knows is shown as a quoted data block. */ untrusted?: UntrustedRegistry;
}): string;
/** Bounded preview of a live host value: type, stable identity, and a short observation. */
export declare function livePreview(value: object, identity?: (value: object) => number): string;
/** The native model loop. Program state stays in NativeSession, never in the model history. */
export declare class NativeToolAgent {
    readonly driver: NativeModelDriver;
    readonly options: {
        maxTurns?: number;
        maxTokens?: number;
        turnTokens?: number;
        actor?: {
            id: string;
            revision: string | null;
        };
        fallbacks?: {
            name: string;
            id: string;
            revision?: string;
            driver: NativeModelDriver;
            promptRendering?: PromptRendering;
            temperature?: number;
            turnTokens?: number;
            contextTokens?: number | null;
            guidance?: boolean | {
                repeat?: number;
                syntax?: boolean;
                retries?: number;
                tools?: string[];
            };
        }[];
        modelBudget?: ModelBudget;
        temperature?: number;
        maxSeconds?: number;
        promptRendering?: PromptRendering;
        systemPrompt?: string | (() => string);
        /** Stored program guidance: one binding, or a scoped set from which each call imports its function's binding,
         * else the program-wide one (guidance/program.ts guidanceForCall). */
        programGuidance?: ProgramGuidance;
        authoredTextGuidance?: AuthoredTextGuidance;
        maxFailureRepairs?: number;
        /** The readout's system prompt (default DECISION_SYSTEM_PROMPT). */
        decisionSystemPrompt?: () => string;
        /** Text for this call only (an iteration predicate's prompt, a retry's guidance): part of the call's notes in its
         * opening message (callNotes), so the system prompt stays the same for every call. */
        callAddendum?: string;
        /** Which finite-typed calls answer by decision readout (native/decision.ts); default `declared`. */
        decisionReadout?: 'declared' | 'finite-returns';
        /** Diagnostic opt-out: retain the ordinary tool loop when the backend cannot score decisions. */
        decisionGeneration?: 'json' | 'tool-loop';
        /** Reasoning samples per `readout: decision` call (native/decision.ts `decisionSamples`; default
         * DECISION_SAMPLES, `NATLANG_DECISION_SAMPLES`); 0 reads every decision out without reasoning, as `readout: instant`. */
        decisionSamples?: number;
        /**
         * Guided generation on natlang's own servers (reference and llama.cpp fork; others never receive it): the reply
         * opens a tool call when one is required, call names are checked, and eval code is checked line by line for
         * repetition and TypeScript syntax, with rejected lines rolled back and resampled. `true` or settings
         * (`{ repeat?, syntax?, retries?, tools? }`); off by default.
         */
        guidance?: boolean | {
            repeat?: number;
            syntax?: boolean;
            retries?: number;
            tools?: string[];
        };
        /**
         * In-run training guidance (native/training-guidance.ts): each consumer call's first model turn selects the facts it
         * may see and has `writeGuidance` write them as Neuralese, in-process; its turns then carry the guidance request,
         * and the policy calls' own turns carry their policy identity. Collection only, on a native-state server.
         */
        trainingGuidance?: TrainingGuidance;
        /** The file tools a directory reducer offers (prompt.ts FileToolSurface; default all). */
        fileTools?: FileToolSurface;
        /**
         * Checks `Is<T, P>` slots of the call's result before it is accepted (native/refinement.ts). A failure goes back
         * to the model as a tool error within the repair budget; past it the call fails with the refinement's code.
         */
        refinement?: {
            checker: RefinementChecker;
            judge?: RefinementJudge;
            escalation?: RefinementJudge;
            /** Optional host-owned return obligation, checked with the same repair feedback as refined slots. */
            returnGuard?: (runId: string) => Promise<RefinementFailure[]>;
        };
        /** Tensor store and write port for soft values (S0 §3). */
        neuralese?: NeuraleseRuntimeOptions;
        /**
         * How values the runtime would cut off are shown (a pluggable part, runtime/pluggable.ts): `crisp` keeps the text
         * cut; `nl` also shows the learned Neuralese operator's state of the whole value (cut-off tool outputs and
         * argument listings) and carries a compacted history state with `compact_history` notes, when the driver reads
         * Neuralese and `neuralese.capture` is configured. Default `crisp`; the model-facing variant `learned-compaction`
         * selects `nl` (plans/neuralese/OPERATORS_RESTORE_20261117.md); env NATLANG_NEURALESE_COMPACTION overrides.
         */
        compaction?: PluggableSetting;
        /**
         * With `compaction` resolving to `nl` (or `shadow`), values longer than this many characters are cut and compacted
         * whatever the context budget (default OPERATOR_COMPACT_CHARS, 8,000; env NATLANG_NEURALESE_COMPACTION_CHARS).
         */
        compactionChars?: number;
        /** Program guidance states: `call` (default) primes them at their real position, `text` writes them from text alone. */
        guidancePriming?: 'call' | 'text';
        /**
         * Receives the deltas of the call's model turns as they stream (plans/STREAMING.md §1.6), with the turn's number
         * (as its `model_request` trace events give it). A turn taken again after a failed request first gets a `reset`.
         * Without it the driver is called with no turn options.
         */
        onDelta?: (turn: number, delta: ModelTurnDelta) => void;
        /**
         * Context budget in prompt tokens (default 16384; null never compacts). Past three quarters of it the oldest
         * tool outputs are elided until the prompt is back under half.
         */
        contextTokens?: number | null;
    };
    readonly proposals: Record<string, unknown>[];
    constructor(driver: NativeModelDriver, options?: {
        maxTurns?: number;
        maxTokens?: number;
        turnTokens?: number;
        actor?: {
            id: string;
            revision: string | null;
        };
        fallbacks?: {
            name: string;
            id: string;
            revision?: string;
            driver: NativeModelDriver;
            promptRendering?: PromptRendering;
            temperature?: number;
            turnTokens?: number;
            contextTokens?: number | null;
            guidance?: boolean | {
                repeat?: number;
                syntax?: boolean;
                retries?: number;
                tools?: string[];
            };
        }[];
        modelBudget?: ModelBudget;
        temperature?: number;
        maxSeconds?: number;
        promptRendering?: PromptRendering;
        systemPrompt?: string | (() => string);
        /** Stored program guidance: one binding, or a scoped set from which each call imports its function's binding,
         * else the program-wide one (guidance/program.ts guidanceForCall). */
        programGuidance?: ProgramGuidance;
        authoredTextGuidance?: AuthoredTextGuidance;
        maxFailureRepairs?: number;
        /** The readout's system prompt (default DECISION_SYSTEM_PROMPT). */
        decisionSystemPrompt?: () => string;
        /** Text for this call only (an iteration predicate's prompt, a retry's guidance): part of the call's notes in its
         * opening message (callNotes), so the system prompt stays the same for every call. */
        callAddendum?: string;
        /** Which finite-typed calls answer by decision readout (native/decision.ts); default `declared`. */
        decisionReadout?: 'declared' | 'finite-returns';
        /** Diagnostic opt-out: retain the ordinary tool loop when the backend cannot score decisions. */
        decisionGeneration?: 'json' | 'tool-loop';
        /** Reasoning samples per `readout: decision` call (native/decision.ts `decisionSamples`; default
         * DECISION_SAMPLES, `NATLANG_DECISION_SAMPLES`); 0 reads every decision out without reasoning, as `readout: instant`. */
        decisionSamples?: number;
        /**
         * Guided generation on natlang's own servers (reference and llama.cpp fork; others never receive it): the reply
         * opens a tool call when one is required, call names are checked, and eval code is checked line by line for
         * repetition and TypeScript syntax, with rejected lines rolled back and resampled. `true` or settings
         * (`{ repeat?, syntax?, retries?, tools? }`); off by default.
         */
        guidance?: boolean | {
            repeat?: number;
            syntax?: boolean;
            retries?: number;
            tools?: string[];
        };
        /**
         * In-run training guidance (native/training-guidance.ts): each consumer call's first model turn selects the facts it
         * may see and has `writeGuidance` write them as Neuralese, in-process; its turns then carry the guidance request,
         * and the policy calls' own turns carry their policy identity. Collection only, on a native-state server.
         */
        trainingGuidance?: TrainingGuidance;
        /** The file tools a directory reducer offers (prompt.ts FileToolSurface; default all). */
        fileTools?: FileToolSurface;
        /**
         * Checks `Is<T, P>` slots of the call's result before it is accepted (native/refinement.ts). A failure goes back
         * to the model as a tool error within the repair budget; past it the call fails with the refinement's code.
         */
        refinement?: {
            checker: RefinementChecker;
            judge?: RefinementJudge;
            escalation?: RefinementJudge;
            /** Optional host-owned return obligation, checked with the same repair feedback as refined slots. */
            returnGuard?: (runId: string) => Promise<RefinementFailure[]>;
        };
        /** Tensor store and write port for soft values (S0 §3). */
        neuralese?: NeuraleseRuntimeOptions;
        /**
         * How values the runtime would cut off are shown (a pluggable part, runtime/pluggable.ts): `crisp` keeps the text
         * cut; `nl` also shows the learned Neuralese operator's state of the whole value (cut-off tool outputs and
         * argument listings) and carries a compacted history state with `compact_history` notes, when the driver reads
         * Neuralese and `neuralese.capture` is configured. Default `crisp`; the model-facing variant `learned-compaction`
         * selects `nl` (plans/neuralese/OPERATORS_RESTORE_20261117.md); env NATLANG_NEURALESE_COMPACTION overrides.
         */
        compaction?: PluggableSetting;
        /**
         * With `compaction` resolving to `nl` (or `shadow`), values longer than this many characters are cut and compacted
         * whatever the context budget (default OPERATOR_COMPACT_CHARS, 8,000; env NATLANG_NEURALESE_COMPACTION_CHARS).
         */
        compactionChars?: number;
        /** Program guidance states: `call` (default) primes them at their real position, `text` writes them from text alone. */
        guidancePriming?: 'call' | 'text';
        /**
         * Receives the deltas of the call's model turns as they stream (plans/STREAMING.md §1.6), with the turn's number
         * (as its `model_request` trace events give it). A turn taken again after a failed request first gets a `reset`.
         * Without it the driver is called with no turn options.
         */
        onDelta?: (turn: number, delta: ModelTurnDelta) => void;
        /**
         * Context budget in prompt tokens (default 16384; null never compacts). Past three quarters of it the oldest
         * tool outputs are elided until the prompt is back under half.
         */
        contextTokens?: number | null;
    });
    /**
     * Views of the arguments whose listing would be cut off, when the runtime has view's Neuralese instance and the driver
     * carries Neuralese: block IDs by argument name. Each is a call of `view(value, instructions)` at its Neuralese
     * representation, its instructions the receiving call's (prompt.ts `listingViewInstructions`). Only plain data is
     * viewed; a failed view keeps the preview.
     */
    /**
     * The learned operator's state of one site (`compaction: nl`, native/operator-frames.ts), or undefined to keep the crisp
     * text cut. A failed operator keeps the cut and is traced; it never fails the call.
     */
    private compactRef;
    /** The characters a message shows of one output: the budget's page, capped at the compaction threshold when learned
     * compaction can run (operator-frames.ts `compactionPageChars`). */
    private pageChars;
    /** The `compaction` setting: the agent option, the runtime option, NATLANG_NEURALESE_COMPACTION, else `nl` under the
     * model-facing variant `learned-compaction` (crisp by default). */
    private compactionSetting;
    /**
     * compact-history in v3: the state of the model's own `compact_history` note, captured in place in the reply that
     * wrote it, so its rows attend to the whole conversation the note replaces (OPERATORS_RESTORE_20261117.md §3.1). No
     * extra model call. Undefined keeps the text note alone (crisp, no capture, or a failed capture, which is traced).
     */
    private noteRef;
    /** The in-context capture of one model call's reply (its content, or the `select`ed text in it), recorded as a
     * `block_write` node carrying the capture's `source_capture`. */
    private capturedRef;
    /** Operator calls per invocation, numbering their own invocation IDs. */
    private readonly operatorCalls;
    /**
     * One learned operator write (OPERATORS_RESTORE_20261117.md §3.1): an ordinary model call at view's site (sampled
     * and captured like every call, under its own invocation ID), then the in-context capture of its reply's content.
     * The write is a `block_write` node with its `source_capture`, so the learners compute the state in-graph from the
     * site and the reply (the pass-through) and train the operator call as a call of the episode.
     */
    private operatorWrite;
    /** The call's instructions as an operator's purpose text (bounded). */
    private purpose;
    private views;
    /** Messages with the runtime's prompt pieces in their soft forms, when a bank is configured and the driver is Neuralese. */
    private softened;
    /** Re-encode foreign soft values from their authenticated source text, never their tensors or adapters. */
    private handoffText;
    /** Record only actually completed native writes, even when the containing turn failed. */
    private nativeWriteOrigins;
    /** A foreign actor's output crosses back into this invocation as source text, not foreign KV state. */
    private handoffOutput;
    /**
     * Turn the Neuralese content of a reply into conversation text: blocks a backend wrote (content parts) and literals
     * written as marker text (stored through the write port) become block markers in the reply and call arguments.
     */
    private decodeNeuralese;
    /**
     * The graph nodes of one model turn: a `block_read` for each block the request carried (positions are
     * [message, part] in the request; a server that reports payload positions gives token positions), and the
     * `model_turn` with its sampling settings and the tool calls it chose.
     */
    private modelTurnNode;
    private toolsScope;
    tools(session: NativeSession): unknown[];
    /** The call's signature line, the type aliases it references, and its instructions. */
    private callHeading;
    private compactCallableScope;
    /** The call's opening message: its signature and instructions, then the names eval can use (the call's notes follow,
     * withCallNotes). */
    private scopeOpening;
    /** Ambient TypeScript declarations for the functions this call can use, with the aliases they reference. */
    private callableDeclarations;
    /** The opening list_files result for a directory reducer: its folder's files, paged when long. */
    private folderListing;
    /**
     * The opening eval: declarations of everything already in scope, as if the model had written them.
     * Values appear as literals (cut off when large); live objects, services and the folder as comments.
     */
    private scopeReading;
    missing(session: NativeSession): string;
    /**
     * Judge the refined slots of the result the model proposes, before the call accepts it. `args` is a return_result
     * call; without it the staged result is checked. Undefined when nothing is refined or everything holds; otherwise
     * the failures, already traced.
     */
    private refinementGate;
    /**
     * Answer a finite-typed call by scoring each allowed value as the reply to its opening (native/decision.ts).
     * Up to DECISION_JOINT_OPTIONS values are scored together, each the whole reply; a larger record type is scored field
     * by field, each step's candidates as the start of the reply after the fields chosen before (`stepCandidates`).
     * Returns false when the readout does not apply, so the tool loop runs; a string is a failure, as from run.
     */
    private decisionReadout;
    /** One recording boundary for actual generation replies, shared by tool turns and JSON decision readouts. */
    private recordGeneratedTurn;
    /**
     * The reasoning of a reasoned decision readout: `samples` generation turns on the readout's own messages (no tools),
     * as the model replies to them, each its own seed; the reasoning of each reply is kept (its answer after the reasoning
     * is not: the options are scored after the reasoning instead). A string is a failure, as from run.
     */
    private decisionReasonings;
    /** Generate on the very same short JSON decision surface used by the scored student. No probabilities are inferred. */
    private generatedDecision;
    /** How program guidance states are primed: `call` (default: at their real position in the call that uses them) or
     * `text` (written from the text alone, from position 0): the agent option, else NATLANG_GUIDANCE_PRIMING. */
    private guidancePriming;
    /** Prime this call's program guidance in its opening (`runtimeProgramGuidance` left a text-written placeholder):
     * the state the call and every later call of the same guidance read. A failed priming keeps the text write, traced. */
    private primeGuidance;
    /** Encode stored policy against this runtime's exact native reader before any model call. */
    private runtimeProgramGuidance;
    run(session: NativeSession): Promise<string | void>;
}
