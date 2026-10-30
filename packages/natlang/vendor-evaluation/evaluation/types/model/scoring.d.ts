/**
 * Batched decision readouts (plans/BATCHED_EXECUTION.md §3.3): the default `scoreMany`, the coalescing wrapper that
 * routes decision readouts arriving together into one `scoreMany`, and the optional explicit-batch endpoint that
 * scores a prefix with K continuations in one request.
 */
import type { DecisionRequest, DecisionScorer, DecisionScores } from '../contracts.js';
import type { Scheduler } from './scheduler.js';
type Settled = PromiseSettledResult<DecisionScores>;
type ScoreOne = (request: DecisionRequest, signal?: AbortSignal) => Promise<DecisionScores>;
type ScoreMany = (items: DecisionRequest[], signal?: AbortSignal) => Promise<Settled[]>;
/** The default `scoreMany`: every item is issued at once, so the scheduler and the server batch them. */
export declare function concurrentScoreMany(score: ScoreOne): ScoreMany;
/**
 * Wrap a scorer so that decision readouts that arrive within `windowMs` (and the same tick) are scored by one
 * `scoreMany`. Callers keep the one-request interface, so `Promise.all` over decision-readout calls, list refinements
 * and classification fan-outs batch with no change in the program. Each caller's own failure and abort stay its own.
 */
export declare function coalescingScorer(base: DecisionScorer, options?: {
    windowMs?: number;
    maxItems?: number;
}): DecisionScorer;
/**
 * The explicit-batch scoring contract (optional endpoint, capability-gated; plans/BATCHED_EXECUTION.md step 2):
 *
 *   POST {url}  { items: [{ messages, continuations: string[], adapters?, ...itemExtra }], ...extra }
 *   200         { results: [{ log_probs: number[], tokens?: number[], prompt_tokens?: number } | { error: string }] }
 *
 * `continuations[k]` is the k-th option written as the closed final assistant message after `messages`. The server
 * prefills each item's prompt once and scores its K continuations from it. `log_probs[k]` and `tokens[k]` mean what
 * they mean in `DecisionScores`, as does `prompt_tokens` (the tokens the item's continuations evaluate in full). 404, 405 and 501 mean the server has no such endpoint; the caller then falls back to concurrent scoring.
 */
export type ExplicitBatchOptions = {
    url: string;
    headers?: Record<string, string>;
    extra?: Record<string, unknown>;
    scheduler?: Scheduler;
    maxItems?: number;
    /** Requests with fewer items go to the fallback (default 2: single items score as well by the fallback). */
    minItems?: number;
    /** Per-item request fields (the llama.cpp fork's `lora` scales of the item's own call). */
    itemExtra?: (item: DecisionRequest) => Record<string, unknown> | undefined;
};
export declare class ScoreEndpointMissing extends Error {
}
export declare function postExplicitBatch(options: ExplicitBatchOptions, items: DecisionRequest[], signal?: AbortSignal): Promise<Settled[]>;
/**
 * `scoreMany` over an optional explicit-batch endpoint, falling back to `fallback` (concurrent items) when the server
 * does not have it. Once the endpoint is found missing it is not asked again.
 */
export declare function explicitBatchScoreMany(options: ExplicitBatchOptions, fallback: ScoreMany): ScoreMany;
export {};
