/** Text that is actually native tool syntax must never be accepted as a plain answer. */
export declare const TOOL_MARKUP: RegExp;
/** The one sentence a reply that closed its reasoning a second time is answered with (`ModelTurn.malformed_call`). */
export declare const SECOND_THINK_CLOSE: string;
/**
 * Whether a reply closed its reasoning more than once. Every natlang engine (managed llama-server and the page through
 * the fork's chat parser, the Python native engine and the SGLang actor through `serve/chat.py`) splits the reply at
 * its first `</think>`, drops that close and returns the rest as content, so a close left in the content or the
 * reasoning is a second one. A server that splits nothing leaves a whole leading `<think>…</think>` block in the
 * content: that block's close is the first. grpo-v4-run2 learned to write a second close after short answers instead of
 * ending its turn (DECISIONS 2026-11-19); read as content, the reply's calls ran and the malformed form was rewarded.
 */
export declare function secondThinkClose(content: string, reasoning: unknown): boolean;
