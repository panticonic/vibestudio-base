/**
 * Wording of `return_result`'s value rejections, the model-facing text a call's model reads when its return_result
 * carries no usable result. An error-text setting, measured live per variant (plans/MODEL_FACING_CHANGES.md):
 *
 *   legacy    `value: bad-action, expected a <T> or a complete typed result already staged in this call` (before a776223e)
 *   field     legacy, but a result sent under another argument names that argument (a776223e)
 *   sentence  one sentence, no diagnostic code: "return_result needs the <T> itself as its value argument."
 *   steps     one sentence, no diagnostic code, the call to make: "Call return_result again with status "success" and
 *             value set to the <T>, or return the <T> from an eval."
 *
 * Small executors read the `value: bad-action` form as "the value was bad-action" and answer `return bad-action`
 * (LFM2.5-350M held cases 10 and 53, 2026-10-12); the sentence forms carry no token that reads as a value.
 * The runtime option `returnErrorText`, else the platform's (Node reads NATLANG_RETURN_ERROR_TEXT), selects; the default
 * is the adopted variant.
 *
 * Adopted: sentence (2026-10-13, scripts/error_text_replay.py on captured contexts). LFM2.5-2.6B recovered on the
 * next turn in 63/66 (legacy), 63/66 (field), 62/66 (sentence), 60/66 (steps); LFM2.5-350M base recovered in none, but
 * echoed the error text back in 0.62 (legacy) and 0.77 (field) of replies against 0 with sentence. The students are
 * small models, so the wording without a value-like token wins.
 */
import type { Diagnostic } from './values.js';
export declare const RETURN_ERROR_TEXTS: readonly ["legacy", "field", "sentence", "steps"];
export type ReturnErrorText = typeof RETURN_ERROR_TEXTS[number];
export declare const DEFAULT_RETURN_ERROR_TEXT: ReturnErrorText;
/** Why the result was not accepted: sent under other argument names, missing with nothing staged, or incomplete. */
export type ReturnValueProblem = {
    kind: 'misplaced';
    fields: string[];
} | {
    kind: 'missing';
} | {
    kind: 'incomplete';
};
export declare function returnErrorText(setting?: string): ReturnErrorText;
/** The diagnostic for `problem` with the result type `type` (formatted) in `variant`'s wording. */
export declare function returnValueRejection(variant: ReturnErrorText, problem: ReturnValueProblem, type: string): Diagnostic;
