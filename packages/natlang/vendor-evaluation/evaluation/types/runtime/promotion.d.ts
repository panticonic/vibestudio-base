/**
 * Promotion policy selection and the off-hot-path review (plans/TIERED_ENGINE.md "Evidence and promotion").
 *
 * The mechanism is crisp and lives in calls/evidence.ts (counters, summaries, applying a decision). The policy, deciding
 * promote / keep / demote from a summary, has two implementations: the fixed rule `crispPolicy`, and the natural-language
 * function applications/specializer/promote.nl. `promotionPolicy` selects between them with `pluggable()` under the store
 * setting `promotionPolicy` (`crisp` default, `nl`, `shadow`). The natural-language policy never runs per call:
 * `reviewPromotions` runs from the specializer loop, over the evidence the store has by then.
 */
import type { CallStore } from '../calls/store.js';
import { type EvidenceSummary, type PromotionDecision } from '../calls/evidence.js';
import { type PluggableMode } from './pluggable.js';
export type PolicyFunction = (summary: EvidenceSummary) => PromotionDecision | Promise<PromotionDecision>;
/** What a policy may answer; anything else is read as `keep`, so a confused model never moves a case or tier. */
export declare function sanitizeDecision(value: unknown): PromotionDecision;
/** The policy as one function: `crisp`, `nl`, or `shadow` (both run, the crisp decision serves, agreement is traced). */
export declare function promotionPolicy(mode: PluggableMode, nl: PolicyFunction): (summary: EvidenceSummary) => Promise<PromotionDecision>;
export type ReviewedSubject = {
    subject: 'case' | 'tier';
    id: string;
    state: string;
    decision: PromotionDecision;
    applied: boolean;
};
/**
 * Judge every case of a current compilation and every tier with evidence by the store's policy and apply the decisions.
 * Under `crisp` the store has already applied the rule as evidence arrived, so nothing is left to do. Under `shadow`
 * both policies are asked and the crisp answer is the one applied (it already was); the natural-language answer is
 * only compared. Under `nl` its answers are applied: a case through `store.decideTier`, a tier by a `promoted` /
 * `demoted` event kept with its last call, which running engines read back.
 */
export declare function reviewPromotions(store: CallStore, nl: PolicyFunction, options?: {
    mode?: PluggableMode;
}): Promise<ReviewedSubject[]>;
