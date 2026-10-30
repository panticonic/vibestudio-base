/**
 * The one chat-completions adapter between the runtime's model turns and an OpenAI-style chat endpoint, shared by
 * every host. A transport only moves a request body to a model and yields what comes back: streamed chunks, or one
 * whole response from an endpoint that does not stream. Everything else lives here: request building, tool-name
 * aliases, assembling streamed deltas into one response, decoding tool calls, truncation, the malformed-call retry,
 * and token accounting.
 */
import type { DecisionScorer, ModelTurn, ModelTurnDelta, ModelTurnOptions, ModelTurnRequest } from '../contracts.js';
type Json = Record<string, unknown>;
/** Streamed chunks (`chat.completion.chunk`), or a single complete `chat.completion` body. */
/** Unwrap exact provider error records shared by completion and native services. */
export declare function providerErrorBody(body: unknown): Record<string, unknown> | undefined;
export type ChatTransport = (body: Json, signal?: AbortSignal, meta?: ChatRequestMeta) => Promise<AsyncIterable<Json> | Json>;
/**
 * What a scheduling transport (model/scheduler.ts) may know about a request without reading its body: the call it
 * belongs to, and a hook for what the scheduler decided. Never sent to the model. A plain transport ignores it.
 */
export type ChatRequestMeta = {
    invocation_id?: string; /** Re-sends of one turn count up from 0. */
    retry?: number;
    /** Turn number within the invocation, when the caller knows it (the scheduler counts requests otherwise). */ turn?: number;
    /** Requests with the same group are sent next to each other (default: the request's system message). */ group?: string;
    onScheduled?: (info: ScheduledInfo) => void;
    /**
     * The turn's delta observer (`ModelTurnOptions.onDelta`, tool aliases already undone). A transport that returns a
     * stream leaves it alone (the adapter assembles the stream and emits); a transport that assembles a stream itself, to
     * post-process the body, passes it to `assembleChatCompletion`.
     */
    onDelta?: (delta: ModelTurnDelta) => void;
};
/** A scheduler's record of one request (see `ScheduleInfo` in scheduler.ts). */
export type ScheduledInfo = {
    batch_id: string;
    batch_size: number;
    in_flight: number;
    queue_wait_ms: number;
    priority: 'running' | 'new';
};
export type ChatExchange = {
    request: ModelTurnRequest;
    wireRequest: Json;
    wireResponse: Json;
};
export type ChatTurnStats = {
    durationMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
    cachedTokens: number | null;
    retries: number;
    scheduling?: TurnScheduling;
};
/** How the scheduler handled a turn's requests: the last request's batch, queue wait summed over retries. */
export type TurnScheduling = {
    batch_id: string;
    batch_size: number;
    in_flight: number;
    queue_wait_ms: number;
    priority: 'running' | 'new';
};
export type ChatCompletionOptions = {
    /** Extra request fields (sampling settings, template arguments). */
    request?: Json;
    /** Runtime tool name -> name the model is shown. */
    toolAliases?: Record<string, string>;
    /** Called with detached snapshots of each request and its (assembled) response. */
    onExchange?: (exchange: ChatExchange) => void | Promise<void>;
    /** Called immediately before every underlying ChatTransport invocation, including malformed-call retries. */
    onRequestStart?: (request: ModelTurnRequest, retryIndex: number) => void | Promise<void>;
    /** Called once per turn with its token counts and duration. */
    onTurn?: (stats: ChatTurnStats) => void;
    /**
     * The transport carries weight adapters (`x_natlang_adapters`, a native-state server). Other transports refuse a
     * request that names adapters instead of sending a field the server would ignore.
     */
    adapters?: boolean;
};
/** Tool-call markup (Qwen-style XML or <tool_call> tags, LFM2's pythonic call markers) left in a reply's text. */
export { TOOL_MARKUP } from '../native/tool-markup.js';
/**
 * The one offered tool whose arguments a reply's whole text is: a JSON object (optionally in a code fence) whose keys
 * include every required parameter of exactly one tool and name no parameter it lacks. Some models write a call out
 * like this instead of calling; a reply that could be prose, or several tools' arguments, is left as text.
 */
export declare function callWrittenAsText(text: string, tools: Array<{
    function: {
        name: string;
    } & Json;
}>): [string, Json] | undefined;
/** Whether a transport answered with streamed chunks rather than one whole body. */
export declare function isStream(value: AsyncIterable<Json> | Json): value is AsyncIterable<Json>;
/**
 * Fold streamed chunks into the `chat.completion` body a non-streaming request would have returned: content,
 * reasoning, and tool calls are concatenated per index; usage and timings come from the chunk that carries them.
 * Content deltas may be arrays of native state parts; then
 * the content is the parts in order, adjacent text merged. A chunk with `x_natlang_message` (natlang's servers: the
 * complete parsed message) is final and authoritative: the body's message is that message, and its other top-level
 * fields (`neuralese`, `x_natlang_…`) are the body's.
 *
 * This is the one place streamed replies are assembled, so it is also where a turn's deltas come from: `onDelta`
 * receives each piece as it is folded in (`ModelTurnDelta`, contracts.ts). A throwing observer is ignored.
 */
export declare function assembleChatCompletion(chunks: AsyncIterable<Json>, onDelta?: (delta: ModelTurnDelta) => void): Promise<Json>;
/** Tool schemas as the model sees them: the runtime's private annotations (`x-natlang…`, `x-optional`) removed. */
export declare function publicSchema(value: unknown): unknown;
/** Tool definitions checked and reduced to what the model sees. */
export declare function modelTools(rawTools: unknown[]): Array<{
    type: 'function';
    function: {
        name: string;
    } & Json;
}>;
/** A model-turn driver over a chat transport. */
export declare function chatCompletionModelTurn(transport: ChatTransport, options?: ChatCompletionOptions): (request: ModelTurnRequest, signal?: AbortSignal, turnOptions?: ModelTurnOptions) => Promise<ModelTurn>;
/**
 * Decision readout over chat completions: each option is sent as the closed final assistant message and scored from
 * the server's `prompt_logprobs` (vLLM; one prefill per option, sharing the server's prefix cache). Tokens every
 * option shares at the start are left out, so the score covers where the options differ through the end of message.
 */
/**
 * A limit on model requests in flight, shared by every transport it wraps (`limitedTransport`). A streamed reply holds
 * its slot until it has been read to the end.
 */
export type RequestLimit = {
    readonly size: number;
    acquire(signal?: AbortSignal): Promise<() => void>;
};
export declare function requestLimit(size: number): RequestLimit;
export declare function limitedTransport(transport: ChatTransport, limit: RequestLimit): ChatTransport;
export declare function promptLogprobDecider(transport: ChatTransport, options?: {
    request?: Json;
    /** Per-decision request fields (a tuned call's weight selection) carried on the decision item itself. */
    extraFor?: (item: object) => Json | undefined;
}): DecisionScorer;
/** Answer requests under `base` (such as `http://neuralese.local`) with `handler`; returns the unregistration. */
export declare function registerLocalEndpoint(base: string, handler: (url: string, init: RequestInit) => Promise<Response>): () => void;
export declare function fetchModel(url: string, init?: RequestInit): Promise<Response>;
export type HttpChatOptions = {
    endpoint: string;
    model: string;
    apiKey?: string;
    headers?: Record<string, string>;
    /** Exact chat-completions URL for APIs whose route is not `{endpoint}/v1/chat/completions`. */
    chatCompletionsUrl?: string;
    /** Stream responses (default). Streaming sends headers at once, so no idle timeout on the way can fire. */
    stream?: boolean;
};
/** Accept a server root or the conventional OpenAI `/v1` API base. */
export declare function openAIEndpointRoot(endpoint: string): string;
/** Chat completions over HTTP, in Node and in browsers. */
export declare function httpChatTransport(options: HttpChatOptions): ChatTransport;
