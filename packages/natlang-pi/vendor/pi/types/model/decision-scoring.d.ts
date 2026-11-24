/**
 * Scoring finite replies with a model's own log-probabilities, as pure functions over the request and response bodies.
 * natlang's OpenAI-compatible driver and every other host that talks to such a server (the Vibestudio model gateway)
 * build the same requests and read the same responses, so there is one implementation of both ends:
 *
 *   - per reply: the prompt plus the reply as the closed final assistant message, `prompt_logprobs: 0`, one token to
 *     generate (`promptLogprobRequest`); `scoresFromPromptLogprobs` sums each reply's token log-probabilities after the
 *     prefix all replies share;
 *   - the explicit-batch endpoint (`scoring.ts`): `batchScoreItem` writes an item, `scoresFromBatchResult` reads its result;
 *   - `open_reply` (a field-by-field step of a record decision) scores each reply as the start of the message: continued
 *     rather than closed on the chat-completions route, the item's `open_reply` on the batch endpoint, echoed back.
 */
import type { DecisionRequest, DecisionScorer, DecisionScores } from '../contracts.js';
type Json = Record<string, unknown>;
/** The softmax of log-probabilities: normalized probabilities in the same order. */
export declare function softmax(logProbs: readonly number[]): number[];
/** The chat-completions body that evaluates `reply` as the closed final assistant message after `messages`, or with
 * `open` as the start of that message (continued, so its end is not part of the prompt); after `reasoning` when given
 * (the message's reasoning, both aliases as for history, chat-completion.ts). */
export declare function promptLogprobRequest(messages: readonly unknown[], reply: string, extra?: Json, open?: boolean, reasoning?: string): Json;
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
/**
 * Whether score items ask for both tokenizations of each option (`split_tokenization`): the engine sums the option's
 * canonical tokenization and its split one (the options' shared leading and trailing characters tokenized apart, so
 * `"spam"` is also `"`,`spam`,`"` where the canonical BPE writes `"sp`,`am"`), since the model may write either.
 * Default on; NATLANG_DECISION_TOKENIZATIONS=canonical scores the canonical tokenization alone. An engine that does
 * not serve the field scores the canonical one (its result has no `split_tokenization` echo).
 */
export declare function splitTokenization(): boolean;
/**
 * Whether a reasoned item carries its reasoning's sampled ids (`reasoning_ids`), which the engine scores in place of the
 * reasoning text re-encoded. Default on; NATLANG_DECISION_REASONING_IDS=rendered scores after the re-encoded text.
 */
export declare function sendReasoningIds(): boolean;
/** One item of the explicit-batch endpoint's request: the prompt and its replies as continuations. */
export declare function batchScoreItem(item: Pick<DecisionRequest, 'messages' | 'options'> & Partial<Pick<DecisionRequest, 'adapters' | 'native_state_modes' | 'native_recording' | 'cache_messages' | 'open_reply' | 'reasoning' | 'reasoning_ids'>>, extra?: Json): Json;
/** One result of the explicit-batch endpoint's response, for an item of `replyCount` replies. */
export type BatchScoreResult = {
    log_probs?: number[];
    tokens?: number[];
    prompt_tokens?: number;
    error?: string;
    open_reply?: boolean;
    reasoning?: boolean;
    native_decision_capture?: Record<string, unknown>;
} | null | undefined;
/** The scores of a batch result for `item`, or the failure it reports. An item scored as open replies must say so: a
 * server that ignored `open_reply` scored them closed, which is refused as `decision-open-unsupported`; likewise an
 * item with reasoning (`decision-reasoning-unsupported`: a server that ignored it scored the replies without it). */
export declare function scoresFromBatchResult(result: BatchScoreResult, item: Pick<DecisionRequest, 'options' | 'open_reply' | 'reasoning'>): DecisionScores;
/** Score `items` together on `scorer` (its `scoreMany` when it batches, else concurrently), in order; the first item
 * that fails fails the whole (an auto-framed readout needs every score: decision-frame.ts `autoFramedScores`). */
export declare function scoreAll(scorer: DecisionScorer, items: DecisionRequest[], signal?: AbortSignal): Promise<DecisionScores[]>;
export {};
