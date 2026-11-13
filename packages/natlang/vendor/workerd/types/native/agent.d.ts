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
export declare const BUILT_INS_LINE = "Eval also has the built-ins nl, iterateOn, transcript and decide; read_code shows how to use each.";
/** Inline children have the same delegation tools as named calls. */
export declare const INLINE_BUILT_INS_LINE = "Eval also has the built-ins nl, iterateOn, transcript and decide; read_code shows how to use each.";
export declare const NL_DEPTH_LIMIT_BUILT_INS_LINE: string;
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
}): string;
/** A call's opening message with its notes (callNotes) as the last paragraph. */
export declare const withCallNotes: (opening: string, notes: string) => string;
export declare const OPENING_THOUGHT = "I'll start by reading this call's arguments into the eval scope.";
export declare const FOLDER_THOUGHT = "Next I'll list the files in this call's folder.";
export declare const DIFF_CODE_DESCRIPTION = "Show the changes made to functions of the program's codebase in this call.";
/** Assistant turns the model has taken, not counting the runtime's pre-filled scope calls. */
export declare function modelTurnsSoFar(messages: readonly Record<string, unknown>[]): number;
export type NativeModelDriver = ((request: ModelTurnRequest, signal?: AbortSignal, options?: ModelTurnOptions) => Promise<ModelTurn> | ModelTurn) & {
    /** Scripted host drivers may ask to route fixed answers by the actual native return contract. */
    readonly requiresResultContract?: boolean;
    /** Optional decision readout (contracts.ts `DecisionRequest`); without it the call runs the tool loop. */
    decide?: DecisionScorer;
    neuraleseRuntime?: () => Promise<NeuraleseRuntimeOptions | undefined>;
};
export declare function inputsListing(session: NativeSession, views?: Readonly<Record<string, string>>): string;
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
        /** `direct`: a leaf call (see `leafOpening`) answers from LEAF_SYSTEM_PROMPT and an opening that shows its arguments,
         * with only return_result offered; `tools` (default): every call gets the full interpreter surface. */
        leafCalls?: 'direct' | 'tools';
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
         * Neuralese and `neuralese.compactor` is configured. Default `crisp` until the live measurement
         * (plans/MODEL_FACING_CHANGES.md 2026-11-03) adopts the learned path; env NATLANG_NEURALESE_COMPACTION overrides.
         */
        compaction?: PluggableSetting;
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
        /** `direct`: a leaf call (see `leafOpening`) answers from LEAF_SYSTEM_PROMPT and an opening that shows its arguments,
         * with only return_result offered; `tools` (default): every call gets the full interpreter surface. */
        leafCalls?: 'direct' | 'tools';
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
         * Neuralese and `neuralese.compactor` is configured. Default `crisp` until the live measurement
         * (plans/MODEL_FACING_CHANGES.md 2026-11-03) adopts the learned path; env NATLANG_NEURALESE_COMPACTION overrides.
         */
        compaction?: PluggableSetting;
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
    /**
     * The opening of a leaf call, or undefined when the call needs the interpreter: a plain function call (no folder,
     * handoff or skills, no escalation tool) with no callable functions or services, whose parameter and result types hold
     * only data (no files, folders, blobs, functions, host objects or Neuralese), and whose arguments and read-only
     * captures are plain data shown whole. Such a call has nothing to run code on, so it answers from the shown values.
     */
    private leafOpening;
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
     * Returns false when the readout does not apply, so the tool loop runs; a string is a failure, as from run.
     */
    private decisionReadout;
    /** Encode stored policy against this runtime's exact native reader before any model call. */
    private runtimeProgramGuidance;
    run(session: NativeSession): Promise<string | void>;
}
