/**
 * Evidence and promotion, one module for compilation cases and for tiers (plans/TIERED_ENGINE.md "Evidence and promotion").
 *
 * Mechanism (crisp, here): the evidence counters, how events fold into them, the summary a policy judges, and applying a
 * decision. Policy: given an `EvidenceSummary`, answer promote / keep / demote with a reason. The fixed rule is
 * `crispPolicy`; the natural-language policy is applications/specializer/promote.nl, and `runtime/promotion.ts` selects
 * between them with `pluggable()` under the store setting `promotionPolicy`. A case and a tier are judged by the same
 * policy over the same counters, so one meaning of compared, worse, live, audited and handed off applies to both.
 */
import type { CallStoreSettings } from './types.js';
/** What a case or a tier has shown. Counts are since the subject was created, or since it was last demoted (tiers). */
export type Evidence = {
    /** Calls the subject served. */
    served: number;
    /** Calls it started and then had to hand to something below (the answer was wrong or its code failed): a failure of the subject. */
    handed_off: number;
    /** Tiers only: attempts that stopped at the subject's guard. Not a failure: the subject was never asked to answer. */
    guard_misses: number;
    /** Tiers only: attempts lost to the infrastructure (a timeout, an unreachable model). Bad luck, not a break. */
    infrastructure: number;
    /** Comparisons against the reference executor: held-out replays, shadow checks and audits. */
    compared: number;
    worse: number;
    better: number;
    /** Of those, comparisons on calls made after the subject existed (shadow and audit). Replays share their context with the training calls. */
    live_compared: number;
    live_worse: number;
    /** Of those, audits of calls the subject served. */
    audited: number;
    audit_worse: number;
    /** The most recent comparisons (up to `RECENT`). */
    recent_compared: number;
    recent_worse: number;
};
export declare const RECENT = 10;
export declare const emptyEvidence: () => Evidence;
/** The thresholds, from the store's settings (`acceptanceBound`, `promotionComparisons`, `promotionLiveComparisons`). */
export type EvidenceRule = {
    bound: number;
    comparisons: number;
    liveComparisons: number;
    auditMinimum: number;
    callMinimum: number;
};
/** Audits before a worse share demotes, and served plus handed-off calls before the hand-off share demotes (§6.2). */
export declare const AUDIT_MINIMUM = 5, CALL_MINIMUM = 10;
export declare const ruleOf: (settings: Pick<CallStoreSettings, "acceptanceBound" | "promotionComparisons"> & Partial<Pick<CallStoreSettings, "promotionLiveComparisons">>) => EvidenceRule;
export type EvidenceState = 'shadow' | 'active' | 'demoted' | 'disabled';
export type EvidenceSummary = {
    subject: 'case' | 'tier';
    /** Case hash, or `function/tier`. */
    id: string;
    state: EvidenceState;
    evidence: Evidence;
    rule: EvidenceRule;
};
export type PromotionDecision = {
    decision: 'promote' | 'keep' | 'demote';
    reason: string;
};
/**
 * The fixed rule (§6.2). A shadow subject is promoted after `comparisons` comparisons with at most `bound` of them worse,
 * and, of those, `liveComparisons` on live calls within the same bound. An active one is demoted when its audits, its
 * hand-offs or its comparisons exceed the bound. Anything else keeps its state. Guard misses and infrastructure failures
 * are not evidence against a subject.
 */
export declare function crispPolicy(summary: EvidenceSummary): PromotionDecision;
/** The state a decision leads to. Only a shadow subject is promoted and only an active one demoted; others stay. */
export declare function applyDecision(state: EvidenceState, decision: PromotionDecision['decision']): EvidenceState;
export type DeoptKind = 'guard' | 'verify' | 'error' | 'infrastructure';
/** `infrastructure` for a failure that says nothing about the subject (the model or the network), else `error`. */
export declare function failureKind(error: unknown): 'error' | 'infrastructure';
/** A tier's running evidence: the counters, and the window behind `recent_*`. */
export type TierEvidence = {
    state: EvidenceState;
    evidence: Evidence;
    window: boolean[];
};
export declare const newTierEvidence: (state: EvidenceState) => TierEvidence;
/** Fold one event into the counters. `served`, `deopt` (by kind) and shadow comparisons count; `promoted`/`demoted` are decisions. */
export declare function foldEvent(row: TierEvidence, event: {
    event: string;
    kind?: string;
}): void;
/** A tier judged by the shared policy: a demoted tier is judged as a shadow one, over the evidence gathered since it was demoted. */
export declare function summaryOfTier(id: string, row: TierEvidence, rule: EvidenceRule): EvidenceSummary;
/** Move a tier to the state a decision leads to; a demoted tier starts a fresh evidence window. Returns the new state if it moved. */
export declare function moveTier(row: TierEvidence, decision: PromotionDecision['decision']): EvidenceState | undefined;
export declare function setTierState(row: TierEvidence, state: EvidenceState): void;
