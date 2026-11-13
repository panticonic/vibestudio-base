/**
 * The reply a decision readout scores, as pure functions with no import (staged with the Pi target): the runtime asks for
 * each allowed value as one JSON value (`decisionPrompt`), and the scorer of a model that does not answer in that form
 * asks for and scores the form it does (`framedDecision`).
 *
 *   - `value` (default): the JSON value itself, `"yes"`. The decision trainer's rows are written this way
 *     (training/neuralese/natlang_neuralese/data/decision_graph.py), so a model natlang trained answers in it.
 *   - `result-object`: `{"result": "yes"}`. An instruction model that natlang did not train does not answer a function
 *     call with a bare JSON string. After the closed reasoning of its template it opens a tool call or an object with the
 *     key `result` (LFM3-1.7B, greedy: `{"result": "refusal"}`). Scoring `"yes"` there evaluates a reply it gives about
 *     e^-15 of the time at its first token, and what separates the options at that point is not the evidence but where
 *     each is listed and how its first token is merged (plans/MODEL_FACING_CHANGES.md, 2026-11-12). Scoring the form
 *     the model writes puts the choice at the token where the options differ.
 */
export type DecisionReply = 'value' | 'result-object';
export declare const DECISION_REPLIES: readonly DecisionReply[];
/** The prompt that asks for one of `replies` (JSON texts) in `frame`. */
export declare const decisionPrompt: (replies: readonly string[], frame?: DecisionReply) => string;
/** The reply text of one value (its JSON) in `frame`. */
export declare const decisionReply: (json: string, frame?: DecisionReply) => string;
/**
 * A readout request (the runtime's: its last message is `decisionPrompt(options)` and its options are JSON values) as
 * the model of `frame` is asked and scored. A request that is not a readout (a judge's own instructions) is returned
 * as it is. Scores come back in the options' order.
 */
export declare function framedDecision<T extends {
    messages: unknown[];
    options: string[];
}>(request: T, frame: DecisionReply | undefined): T;
