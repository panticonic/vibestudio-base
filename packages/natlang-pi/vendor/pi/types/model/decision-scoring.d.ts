/**
 * Scoring finite replies with a model's own log-probabilities, as pure functions over the request and response bodies.
 * natlang's OpenAI-compatible driver and every other host that talks to such a server (the Vibestudio model gateway)
 * build the same requests and read the same responses, so there is one implementation of both ends:
 *
 *   - per reply: the prompt plus the reply as the closed final assistant message, `prompt_logprobs: 0`, one token to
 *     generate (`promptLogprobRequest`); `scoresFromPromptLogprobs` sums each reply's token log-probabilities after the
 *     prefix all replies share;
 *   - the explicit-batch endpoint (`scoring.ts`): `batchScoreItem` writes an item, `scoresFromBatchResult` reads its result.
 */
import type { DecisionRequest, DecisionScores } from '../contracts.js';
type Json = Record<string, unknown>;
/** The softmax of log-probabilities: normalized probabilities in the same order. */
export declare function softmax(logProbs: readonly number[]): number[];
/** The chat-completions body that evaluates `reply` as the closed final assistant message after `messages`. */
export declare function promptLogprobRequest(messages: readonly unknown[], reply: string, extra?: Json): Json;
/** What one reply's response is read for: the server's `prompt_logprobs` rows and the prompt tokens it evaluated. */
export type PromptLogprobResponse = {
    prompt_logprobs?: unknown;
    usage?: {
        prompt_tokens?: number;
    };
};
/**
 * The scores of replies from their responses (in reply order). Each response's rows map token ID to its entry; with
 * `prompt_logprobs: 0` the prompt's own token is the only (first) key. A reply's score is the sum of its tokens'
 * log-probabilities after the prefix all replies share. A server that returns no `prompt_logprobs` cannot score.
 */
export declare function scoresFromPromptLogprobs(responses: readonly PromptLogprobResponse[]): DecisionScores;
/** One item of the explicit-batch endpoint's request: the prompt and its replies as continuations. */
export declare function batchScoreItem(item: Pick<DecisionRequest, 'messages' | 'options'> & Partial<Pick<DecisionRequest, 'adapters' | 'native_state_modes' | 'native_recording'>>, extra?: Json): Json;
/** One result of the explicit-batch endpoint's response, for an item of `replyCount` replies. */
export type BatchScoreResult = {
    log_probs?: number[];
    tokens?: number[];
    prompt_tokens?: number;
    error?: string;
    native_decision_capture?: Record<string, unknown>;
} | null | undefined;
/** The scores of a batch result, or the failure it reports. */
export declare function scoresFromBatchResult(result: BatchScoreResult, replyCount: number): DecisionScores;
export {};
