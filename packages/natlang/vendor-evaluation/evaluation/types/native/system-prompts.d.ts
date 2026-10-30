import { type NeuraleseRef } from './neuralese.js';
export declare const SYSTEM_PROMPT_TYPE = "Neuralese<SystemPrompt>";
export type PromptRendering = 'full' | 'program-header';
export type PromptPiece = {
    readonly id: string;
    readonly text: string;
    readonly scope: 'generic' | 'program';
};
/** The current runtime's prompt pieces. IDs are stable across runtime versions; texts are this version's. */
export declare function promptPieces(): PromptPiece[];
/** Soft forms by piece ID, with the text each was registered for (the text that is replaced). */
export type SystemPromptBank = ReadonlyMap<string, {
    readonly text: string;
    readonly value: NeuraleseRef;
}>;
/** A bank from soft forms by piece ID; each piece's text comes from `pieces` (default: this runtime's pieces). */
export declare function systemPromptBank(values: Readonly<Record<string, unknown>>, pieces?: readonly PromptPiece[]): SystemPromptBank;
/** Where pieces occur in a text, longest pieces first and without overlaps: [start, end, piece]. */
export declare function findPieces<P extends Pick<PromptPiece, 'id' | 'text'>>(text: string, pieces: readonly P[]): [number, number, P][];
/** A text with each banked piece replaced by its block's sentinel. */
export declare function softenText(text: string, bank: SystemPromptBank): string;
/** Install where scoped soft prompts come from (the learning module's `withSystemPrompts`). */
export declare function setSystemPromptSource(next: () => SystemPromptBank | undefined): void;
/** The bank in force: the runtime's bank with the pieces of the current scope (`withSystemPrompts`) over it. */
export declare function activeSystemPrompts(base: SystemPromptBank | undefined): SystemPromptBank | undefined;
/** Messages with the banked pieces of their text content softened. Model replies (assistant turns) are left alone. */
export declare function softenMessages<M extends Record<string, unknown>>(messages: readonly M[], bank: SystemPromptBank | undefined): M[];
/** Remove runtime-owned generic prose, preserving program declarations and caller-supplied additions verbatim.
 * Program pieces can be nested in a larger generic piece (also used by soft prompt banks).
 * Matching the two scopes independently makes those declarations survive the encompassing replacement.
 */
export declare function renderSystemPrompt(text: string, mode?: PromptRendering, pieces?: PromptPiece[]): string;
/** Shared outbound rendering; an empty header has no system turn. History and user content are untouched. */
export declare function renderPromptMessages<M extends Record<string, unknown>>(messages: readonly M[], mode?: PromptRendering): M[];
