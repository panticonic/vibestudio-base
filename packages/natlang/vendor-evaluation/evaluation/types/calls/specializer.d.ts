import type { CallableDefinition } from '../runtime/kernel.js';
import type { NatlangRuntime } from '../runtime/runtime.js';
import { type Approach, type Example, type Rule } from './mining.js';
import type { CallStore } from './store.js';
import { type CallRecord, type DeclineReason, type Verdict } from './types.js';
/** Everything the specializer knows about one definition revision. */
export type Study = {
    key: string;
    definition: CallableDefinition;
    loaded: boolean;
    records: Map<string, CallRecord>;
    examples: Example[];
    approaches: Approach[];
    rules: Rule[];
    unclassified: string[];
    skipped: number;
};
/** Successful agent calls of a definition revision as examples, with approaches and induced conditions. */
export declare function study(store: CallStore, key: string, options?: {
    limit?: number;
    minSupport?: number;
}): Study | undefined;
/** A crisp reason to decline before any model is asked (§5.3), or undefined. */
export declare function crispDecline(subject: Study, minCalls: number): {
    reason: DeclineReason;
    why: string;
} | undefined;
/** The evidence folder's files (§7.6). `report` is the previous verification round, `history` earlier outcomes. */
export declare function renderEvidence(store: CallStore, subject: Study, extra?: {
    report?: string;
    history?: string;
    previousCases?: string;
}): Record<string, string>;
/** function.md: the function's instructions, signature, what a case may call, and its volume. */
export declare function renderFunction(subject: Study): string;
/** One recorded call as the evidence shows it. */
export declare function exampleOf(store: CallStore, record: CallRecord): Record<string, unknown>;
/** History for the evidence folder: the current compilation's cases and numbers, hand-offs, declines. */
export declare function renderHistory(store: CallStore, key: string): {
    history: string;
    previousCases?: string;
};
export type CaseCheck = {
    position: number;
    hash: string;
    source: string;
    admitted: number;
    heldOutAdmitted: number;
    results: {
        callId: string;
        split: 'training' | 'held-out';
        verdict: Verdict | 'error' | 'skipped';
        detail?: string;
    }[];
    guardErrors: number;
    accepted: boolean;
    reason: string;
};
/**
 * Check every case of a cases file on the recorded calls its guard admits (the first admitting case takes a call, as at
 * runtime). Equal behavior passes; a difference goes to the judge. A case is accepted when it admits at least one call
 * and no more than `bound` of its calls are worse, failed, or diverged.
 */
export declare function verifyCases(runtime: NatlangRuntime, store: CallStore, subject: Study, text: string, options?: {
    bound?: number;
    maxJudged?: number;
    signal?: AbortSignal;
}): Promise<{
    checks: CaseCheck[];
    error?: string;
}>;
/** The verification report written into the evidence folder for the next round (report.md). */
export declare function renderReport(store: CallStore, subject: Study, result: {
    checks: CaseCheck[];
    error?: string;
}): string;
/** A cases file with only the cases at `keep` (by position), the rest of the file unchanged. */
export declare function keepCases(text: string, keep: readonly number[]): string;
/**
 * Save the accepted cases of a verified cases file as the definition's current compilation, with links from each case
 * to the calls it covers and its held-out verdicts counted toward promotion (§6.2).
 */
export declare function saveAccepted(store: CallStore, subject: Study, text: string, checks: CaseCheck[], report: string, meta?: Record<string, unknown>, extraFiles?: Record<string, string>): {
    id: string;
    cases: number;
} | undefined;
