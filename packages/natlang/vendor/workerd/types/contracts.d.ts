/** Model-turn contract shared by model transports and the interpreter's tool agent. */
/** temperature is omitted unless the application configures one; the model's server keeps its own sampling. */
/** Invocation identity is collector metadata; transports do not send it as model input. */
export type ModelTurnRequest = {
    invocation_id?: string;
    messages: unknown[];
    tools: unknown[];
    temperature?: number;
    /** Exact allowed tools for parsing native XML replies, never included in the model-facing prompt. */
    response_tools?: unknown[];
    seed: number | null;
    max_tokens: number | null;
    /** "required": the reply must be a tool call (a turn that offers exactly the tool it must use). Default "auto". */
    tool_choice?: 'auto' | 'required';
    /** Weight adapters bound in the calling function's context (Neuralese servers only; others refuse the call). */
    adapters?: {
        id: string;
        scale: number;
    }[];
    /**
     * Template readout (Neuralese servers only): the reply is forced to a call of `call` with `arguments`, cut at its
     * `value` argument; `write` makes the value a written native state span and closes the call, `decode` decodes the value.
     */
    template?: {
        call: string;
        arguments: Record<string, unknown>;
        value: 'write' | 'decode';
        /** The argument the value is written into (default `value`). */
        argument?: string;
        /** Keys addressing the value inside nested arguments, starting at `argument`. */
        argument_path?: (string | number)[];
        /** Native value syntax in the model prefix; opaque placeholders remain strings on the wire. */
        value_type?: 'string' | 'unknown';
        /** A nudge, not a readout: a server without templates samples the reply freely instead of refusing the request. */
        optional?: true;
    };
    /** Guided generation (natlang's servers only): see the agent's `guidance` option. */
    guidance?: boolean | Record<string, unknown>;
    /**
     * Training guidance for this turn's call (native servers only; `x_natlang_privileged_context`): the
     * `natlang.guidance-request/1` built by native/training-guidance.ts, which the engine renders into the prompt.
     */
    privileged_context?: Record<string, unknown>;
    /** This turn belongs to the in-run guidance policy (native servers only; `x_natlang_guidance_policy`). */
    guidance_policy?: {
        function: 'selectGuidanceFacts' | 'writeGuidance';
        sha256: string;
    };
    /** Host-side exact teacher target for native forced replay; sent only as transport metadata, never in messages. */
    native_teacher_forced_turn?: {
        schema: 'natlang.native-teacher-forced-turn/1';
        assistant: Record<string, unknown>;
        source_receipt: Record<string, unknown>;
        native_text_spans?: {
            path: (string | number)[];
            marker: string;
            text: string;
        }[];
    };
    /** Structural call binding, host-only; never rendered into model messages. */
    native_execution_occurrence?: NativeExecutionOccurrence;
};
/** Source-graph occurrence identity; this is collected by the runtime and never rendered into model messages. */
export type NativeExecutionOccurrence = {
    schema: 'natlang.execution-occurrence/1';
    definition_id: string;
    revision: string;
    context: string;
    signature: string;
    parent_occurrence_sha256: string | null;
    sibling_ordinal: number;
    argument_binding_sha256: string;
    occurrence_sha256: string;
};
export type ModelTurnRequestWithOccurrence = ModelTurnRequest & {
    native_execution_occurrence?: NativeExecutionOccurrence;
};
/**
 * Native state content. In a request, a message's `content` and a tool call's `function.arguments` may be arrays of
 * parts instead of strings, where they carry archived `nzs1` state. Drivers that carry these parts declare native
 * state transport explicitly; the runtime never sends them through a flat vector-block adapter.
 */
export type ModelContentPart = {
    type: 'text';
    text: string;
} | {
    type: 'native_state';
    id: string;
    /** This use is a constant in gradients and captures. */
    stop_gradient?: true;
    /** The producer occurrence that wrote the state, copied to the import receipt. */
    source_occurrence?: string;
};
/** Calls are an ordered, non-atomic batch. Dependent calls belong in later turns. */
/** A server-observed malformed native control turn, never executable model text. */
export type NativeProtocolFailure = {
    schema: 'natlang.native-marker-failure/1';
    code: 'neuralese-native-state-open' | 'neuralese-native-state-close' | 'neuralese-native-state-consume-marker' | 'neuralese-native-state-nested';
    message: string;
    trigger: 'sample' | 'length';
    sample_index: number | null;
    fed: boolean;
    own_input_count: number;
    generated_input_count: number;
    max_tokens: number;
    stop_token_ids: number[];
};
export type ModelTurn = {
    protocol_failure?: NativeProtocolFailure;
    calls?: [string, Record<string, unknown>][];
    text?: string;
    raw_calls?: unknown[];
    completion_tokens?: number;
    prompt_tokens?: number;
    /** Prompt tokens the server reused from its cache instead of prefilling them (llama.cpp `cache_n`, OpenAI cached tokens). */
    cached_tokens?: number;
    /** Server time spent prefilling the prompt and generating the reply, when it reports them (llama.cpp `timings`). */
    prefill_ms?: number;
    generation_ms?: number;
    /** Native XML was parsed from this actual assistant content, never fabricated provider tool_calls. */
    tool_parse?: {
        schema: 'natlang.native-xml-tool-parse/1';
        source: 'assistant-content';
        schema_custody: 'response_tools';
        policy_sha256: string;
        wire_tool_aliases: Record<string, string>;
    };
    /** Exact provider-context provenance, when an adapter supplies it. */
    transport_provenance?: Record<string, unknown>;
    value_confidence?: (number | {
        geometric_mean?: number;
    } | null)[];
    raw_response?: Record<string, unknown>;
    /** The model's reasoning before this turn's reply, when the backend returns it. */
    reasoning?: string;
    /** A synthetic plan elicited in a separate required-tool turn before this reply. */
    /** null means planning was requested but the provider did not produce a valid plan. */
    execution_plan?: string | null;
    /** The reply stopped at max_tokens. */
    truncated?: boolean;
    /** How the model scheduler batched this turn's request (batch id and size, requests in flight, queue wait). */
    scheduling?: {
        batch_id: string;
        batch_size: number;
        in_flight: number;
        queue_wait_ms: number;
        priority: 'running' | 'new';
    };
};
/**
 * A piece of a model turn while it streams (plans/STREAMING.md §1.1), in the order the model produced it:
 * - `text`, `reasoning`: the next characters of the reply or of the reasoning before it;
 * - `tool_call`: a fragment of call `index` — its `id` and `name` when they arrive (names already as the runtime
 *   knows them, tool aliases undone), and the next `arguments` text (JSON text, possibly with Neuralese parts);
 * - `native_state`: a native-state artifact the server wrote into the reply, once complete (`block`: metadata when sent);
 * - `reset`: the turn's request is sent again (a malformed-call retry, or a retry after restoring blocks); deltas so
 *   far belong to an abandoned attempt.
 * Deltas are hints for showing and preparing: the turn the driver returns stays authoritative (on a Neuralese server,
 * the final message it sends). A driver emits deltas only for replies it receives as a stream; a whole reply emits
 * none. They come from the one place streamed chunks are assembled (`assembleChatCompletion`), so the deltas of a
 * turn concatenate to the content of the turn assembled from them.
 */
export type ModelTurnDelta = {
    type: 'text';
    text: string;
} | {
    type: 'reasoning';
    text: string;
} | {
    type: 'tool_call';
    index: number;
    id?: string;
    name?: string;
    arguments?: string;
} | {
    type: 'native_state';
    part: Extract<ModelContentPart, {
        type: 'native_state';
    }>;
    block?: Record<string, unknown>;
} | {
    type: 'reset';
};
/**
 * Per-call options of a model-turn driver, its optional third argument: `(request, signal?, options?)`. They are not
 * part of `ModelTurnRequest`, which is data (recorded, cloned, sent to workers). `onDelta` receives the turn's
 * deltas as they arrive; it must not throw (an observer never affects the turn) and is not awaited.
 */
export type ModelTurnOptions = {
    onDelta?: (delta: ModelTurnDelta) => void;
    /** Host-only structural result check, supplied only to drivers explicitly requesting it. Never model input. */
    acceptsResult?: (value: unknown) => boolean;
};
/**
 * Decision readout (single pass over the prompt): score a finite set of assistant replies after `messages`.
 *
 * This is an optional capability of any model driver, not of a particular backend: a driver carries a
 * `decide: DecisionScorer` property (`Object.assign(driver, { decide })`; wrappers copy it with the driver). The runtime
 * uses it for `readout: decision` functions, `decisionReadout: 'finite-returns'`, refinement judges and `decide(fn, ...)`
 * in eval, wherever the call's result type is finite. A driver without it, or whose `decide` fails with
 * `decision-unsupported`, gets the ordinary tool loop for that call; no other error is swallowed. Endpoint drivers
 * implement it through `prompt_logprobs` (chat-completion.ts) or the llama.cpp fork's score endpoint (scoring.ts); a
 * gateway driver implements it by asking whatever service owns the model, and may declare `scoreMany` to batch.
 * `log_probs[i]` is the total log-probability of `options[i]`
 * as the reply, end of message included, and `tokens[i]` counts the tokens scored. A scorer may leave out the tokens
 * every option shares at the start (the chat-completion scorer does; the native server scores each whole reply):
 * that changes every option's score by the same amount, so normalized scores and the choice agree.
 * A backend that cannot score replies fails with an error whose message starts with `decision-unsupported`.
 */
export type DecisionRequest = {
    messages: unknown[];
    options: string[];
    adapters?: {
        id: string;
        scale: number;
    }[];
    /** Exact native input contracts/capture; transport metadata, never model instructions. */
    native_state_modes?: Record<string, 'same-base-adapter-state'>;
    native_recording?: boolean;
    /** The call this readout answers and whether it is the run's root or a child call (host metadata: rollout turn
     * identity, JOLT+ privileged context), never model input. */
    invocation_id?: string;
    invocation_role?: 'root' | 'child';
    /** Set by the transport for a JOLT+ teacher attempt: the server renders this invocation's privileged block. */
    x_natlang_privileged_context?: Record<string, unknown>;
};
export type DecisionScores = {
    log_probs: number[];
    tokens?: number[];
    /** The prompt tokens the scorer processed for this readout, when the backend reports them (usage accounting). */
    prompt_tokens?: number;
    /** Set only by an RL collection scorer that samples the readout for exploration: the option the call returns
     * instead of the most probable one (its sampling receipt is recorded with the capture). */
    chosen?: number;
    native_decision_capture?: Record<string, unknown>;
    /** Host-only association to the active learning recorder. */
    x_natlang_native_recorded_turn?: string;
    /** Set by a coalescing scorer: the batch this readout was scored in. */
    batch?: {
        batch_id: string;
        batch_size: number;
    };
};
export type DecisionScorer = ((request: DecisionRequest, signal?: AbortSignal) => Promise<DecisionScores>) & {
    /**
     * Score many requests at once, so the backend can batch them (plans/BATCHED_EXECUTION.md §3.3). One entry per item,
     * in order; an item that cannot be scored fails alone. Optional: use `scoreMany` from native/decision.ts, which
     * falls back to issuing the items concurrently.
     */
    scoreMany?: (items: DecisionRequest[], signal?: AbortSignal) => Promise<PromiseSettledResult<DecisionScores>[]>;
};
/** Aggregate-only progress from a streaming provider turn. Contains no generated content. */
export type ModelStreamProgress = {
    status: 'progress' | 'completed' | 'failed';
    deltaEvents: number;
    deltaBytes: number;
    textDeltaEvents: number;
    textDeltaBytes: number;
    thinkingDeltaEvents: number;
    thinkingDeltaBytes: number;
    toolCallDeltaEvents: number;
    toolCallDeltaBytes: number;
    startedAt: string;
    observedAt: string;
    elapsedMs: number;
};
export type ModelStreamProgressSink = (progress: ModelStreamProgress) => void;
/**
 * Per-call options of a model session's turn (a managed local server, a Pi provider backend): the driver's turn
 * options, plus `onProgress`, aggregate-only stream progress for operators (no generated content).
 */
export type SessionTurnOptions = ModelTurnOptions & {
    onProgress?: ModelStreamProgressSink;
};
