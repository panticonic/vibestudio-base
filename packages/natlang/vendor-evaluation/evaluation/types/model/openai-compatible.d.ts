/** Chat completions over HTTP: the shared adapter (chat-completion.ts) with the HTTP transport. */
import { type ChatExchange, type HttpChatOptions, type RequestLimit } from './chat-completion.js';
import type { ModelTurnRequest } from '../contracts.js';
import type { Scheduler } from './scheduler.js';
export { fetchModel } from './chat-completion.js';
export type OpenAICompatibleExchange = ChatExchange;
export type OpenAICompatibleOptions = HttpChatOptions & {
    toolAliases?: Record<string, string>;
    request?: Record<string, unknown>;
    onExchange?: (exchange: OpenAICompatibleExchange) => void | Promise<void>;
    onRequestStart?: (request: ModelTurnRequest, retryIndex: number) => void | Promise<void>;
    /**
     * Requests in flight at once, turns and decision scoring together: a number, a limit shared with other drivers, or
     * a model scheduler (model/scheduler.ts), which also orders the queue and records each request's batch.
     */
    concurrency?: number | RequestLimit | Scheduler;
    /** Optional explicit-batch scoring endpoint (see model/scoring.ts): a URL, or true for `{endpoint}/v1/natlang/score`. */
    scoreEndpoint?: string | boolean;
    /** Decision readouts arriving within this many ms are scored together (default 0: the same tick). */
    scoreCoalesceMs?: number;
    /**
     * The score endpoint also scores single readouts and carries each item's tuned request fields (the llama.cpp fork,
     * whose chat completions have no prompt_logprobs and whose score items take `lora`).
     */
    scoreAll?: boolean;
    /**
     * Extra request fields selecting the current call's tuned weights (llama.cpp's per-request `lora` scales). Read in
     * the calling invocation's context, before any queueing or coalescing, so each request carries its own stack.
     */
    tunedRequest?: () => Record<string, unknown> | undefined;
    /**
     * Native state spans the server has loaded by ID (the llama.cpp fork's `--native-state`, e.g. tuned soft
     * instructions). Message text holding a state's sentinel is sent as content parts with `{type: "native_state", id}`;
     * a sentinel naming a state the server has not loaded is `weights-unavailable`.
     */
    nativeStates?: () => ReadonlySet<string>;
};
/** Messages whose text carries native state sentinels, as content-part arrays the llama.cpp fork consumes exactly. */
export declare function nativeStateMessages(messages: readonly unknown[], loaded: ReadonlySet<string>): unknown[];
/**
 * Configurable OpenAI chat-completions transport; natlang policy stays in the runtime. Its `decide` scores finite
 * replies through `prompt_logprobs` (servers without them fail with `decision-unsupported`); its `contextWindow` asks
 * the server how many tokens the model's context holds (undefined when the server does not say).
 */
export declare function openAICompatibleModelTurn(options: OpenAICompatibleOptions): ((request: ModelTurnRequest, signal?: AbortSignal, turnOptions?: import("../contracts.js").ModelTurnOptions) => Promise<import("../contracts.js").ModelTurn>) & {
    model: string;
    decide: import("../contracts.js").DecisionScorer;
    contextWindow: () => Promise<number | undefined>;
};
/** The model's context length as the server reports it: vLLM's max_model_len, llama.cpp's n_ctx, or a context_length field. */
export declare function serverContextWindow(http: HttpChatOptions): Promise<number | undefined>;
