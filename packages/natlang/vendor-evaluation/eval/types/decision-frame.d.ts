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
/**
 * A profile's `decisionReply`: one form, or `auto` (the default except for a managed stock model): a readout without
 * reasoning is read in the form the model puts more probability on (`autoFramedScores`). Whether a checkpoint answers a
 * readout with the bare value right after its empty think block depends on how it was trained, which its files do not
 * say: the B14 triage bench's native checkpoint 5ff07638 (the checkpoint a stale `lfm-latest` profile served) puts
 * ~e^-8 on the bare value there and opens a tool call instead, so its option scores followed the listing order and the
 * value's first-token merges (`billing` for spam, `true` on every ticket: 4/28, against 26/28 in `{"result": VALUE}`),
 * while aei1's collection policy e15b20a8 puts nearly all of its mass on the bare value (DECISIONS 2026-11-23
 * "instant readout collapse").
 */
export type DecisionReplySetting = DecisionReply | 'auto';
export declare const DECISION_REPLY_SETTINGS: readonly DecisionReplySetting[];
/** The prompt that asks for one of `replies` (JSON texts) in `frame`. */
export declare const decisionPrompt: (replies: readonly string[], frame?: DecisionReply) => string;
/** The reply text of one value (its JSON) in `frame`; `open` is the start of a reply (a field-by-field step), not closed. */
export declare const decisionReply: (json: string, frame?: DecisionReply, open?: boolean) => string;
/**
 * The prompt of a decision over a record type too large to list (native/decision.ts `decisionDomain`): each form is
 * one arm of the type as compact JSON with every field's values written `<A | B>` (`formText`), and the reply is
 * scored field by field.
 */
export declare const decisionFieldsPrompt: (forms: readonly string[], frame?: DecisionReply) => string;
/**
 * A readout request (the runtime's: its last message is `decisionPrompt(options)` and its options are JSON values) as
 * the model of `frame` is asked and scored. A request that is not a readout (a judge's own instructions) is returned
 * as it is. Scores come back in the options' order.
 */
export declare function framedDecision<T extends {
    messages: unknown[];
    options: string[];
    open_reply?: boolean;
}>(request: T, frame: DecisionReply | undefined): T;
/** The `decisionReply` in force: `NATLANG_DECISION_REPLY` (value, result-object or auto) overrides the profile's. */
export declare function decisionReplySetting(configured: DecisionReplySetting | undefined): DecisionReplySetting | undefined;
/**
 * Score a readout in the reply form `reply` names (`framedDecision`); under `auto`, in the form the model answers in.
 *
 * `auto` applies to a joint readout without reasoning (after its own reasoning the model answers in the form the
 * request asks for, the bare value; a field-by-field step continues the form its first step chose, the value): the
 * request is scored in both forms, and each option of each form is also scored alone. An option scored alone keeps
 * the tokens it shares with the others (`</think>`, the object's opening), so the sum of a form's lone scores is the
 * model's probability of answering in that form at all. The form with more of it is read: its scores (the options
 * together, the shared tokens cancelled exactly) are returned with `reply_frame` and both forms' `reply_masses`
 * (natural log). One round of 2 + 2K items, which a batching server scores together.
 */
export declare function autoFramedScores<T extends {
    messages: unknown[];
    options: string[];
    open_reply?: boolean;
    reasoning?: string;
}, S extends {
    log_probs: number[];
}>(request: T, reply: DecisionReplySetting | undefined, scoreAll: (items: T[]) => Promise<S[]>): Promise<S & {
    reply_frame?: DecisionReply;
    reply_masses?: Record<DecisionReply, number>;
}>;
