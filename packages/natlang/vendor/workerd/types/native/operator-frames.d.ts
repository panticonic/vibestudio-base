import { type NeuraleseRef } from './neuralese.js';
export type ValueOperator = 'compact-value' | 'compact-params' | 'extract';
export type CompactSite = {
    operator: ValueOperator;
    instructions: string;
    value: string;
    note?: string;
};
/** One reply of a model call to capture in its own context: its request and, when the server reported them, its exact
 * prompt and sampled token ids (else its text and reasoning). */
export type CapturedCall = {
    messages: unknown[];
    tools: unknown[];
    prompt?: number[];
    reply?: number[];
    text?: string;
    reasoning?: string;
    /** Capture the tokens of this text inside the reply (a `compact_history` note in its tool call) instead of the
     * reply's content. */
    select?: string;
};
export type NativeCapture = (call: CapturedCall, options?: {
    type?: string;
}) => Promise<import('./neuralese-store.js').NeuraleseBlockMeta>;
/**
 * How a consumer is shown an operator's state: open + state + close. Must equal the Python registry's
 * `consumer_open`/`consumer_close` (tests/neuralese/test_learned_operators.py checks this file).
 */
export declare const OPERATOR_FRAMES: Record<CompactSite['operator'] | 'compact-history', {
    open: string;
    close: string;
}>;
/** The framed sentinel of an operator's state, as text the driver turns into a native-state part. */
export declare function framedState(operator: CompactSite['operator'] | 'compact-history', ref: NeuraleseRef): string;
/** The operators' reply caps in tokens (learned_operators.py `seed_cap`). */
export declare const OPERATOR_SPAN_CAPS: Record<CompactSite['operator'] | 'compact-history', number>;
/** Reasoning room of an operator call beyond its reply cap (tokens). */
export declare const OPERATOR_REASONING_TOKENS = 2048;
/**
 * With learned compaction selected, a tool output or argument longer than this many characters (~2k tokens) is cut and
 * compacted, whatever the call's context budget: learned compaction keeps large values out of the context, so it does
 * not wait until a value would overflow the budget's page (OPERATORS_RESTORE_20261117.md §10). The agent option
 * `compactionChars` and env NATLANG_NEURALESE_COMPACTION_CHARS set it.
 */
export declare const OPERATOR_COMPACT_CHARS = 8000;
/** The characters a message shows of one output: the budget's page (`shownCharsFor`), and with learned compaction
 * selected at most `compactionChars`. */
export declare function compactionPageChars(contextTokens: number | null | undefined, compactionChars?: number): number;
/** Values shorter than this keep the text cut only: a structural cut of a small value does not spend an operator call
 * (the case floor, COMPACTION_OPERATOR_CONVERTERS.md §3b). */
export declare const OPERATOR_MIN_CHARS = 800;
/**
 * The write site of compact-value and compact-params: the builtin `view(value, instructions)` (one summarizer family,
 * DECISIONS.md 2026-10-09). Must equal training/neuralese/natlang_neuralese/view.py `view_site`
 * (tests/neuralese/test_learned_operators.py checks this file).
 */
export declare function viewSiteMessages(value: string, instructions?: string): {
    role: 'system' | 'user';
    content: string;
}[];
/** The purpose of a compact-value site: a cut-off tool or service output read for the calling function's purpose. */
export declare function valueInstructions(tool: string, purpose: string): string;
/** The purpose of a compact-params site: a cut-off argument of the call that receives it. */
export declare function argumentInstructions(name: string, type: string, purpose: string): string;
/** A call's instructions as an operator's purpose text (bounded). */
export declare function operatorPurpose(body: string): string;
