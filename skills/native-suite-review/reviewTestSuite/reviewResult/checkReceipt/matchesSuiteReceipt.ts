import type { SuiteReviewPlan, SuiteVerificationIdentity } from "../../../types.js";

export default function matchesSuiteReceipt(
  plan: SuiteReviewPlan,
  receipt: SuiteVerificationIdentity | null,
): boolean {
  return receipt !== null &&
    receipt.operation === "test" &&
    receipt.target === plan.target &&
    receipt.suite === plan.suite &&
    receipt.runtime === plan.runtime &&
    receipt.contextId === plan.contextId &&
    receipt.ref === `ctx:${plan.contextId}` &&
    receipt.stateHash === plan.stateHash;
}
