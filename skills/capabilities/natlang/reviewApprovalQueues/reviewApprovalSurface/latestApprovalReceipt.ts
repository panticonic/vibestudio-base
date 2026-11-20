import type { ApprovalQueueReceipt, ApprovalSurface } from "../../types.js";

export default function latestApprovalReceipt(
  source: ApprovalSurface,
  receipts: ApprovalQueueReceipt[],
): ApprovalQueueReceipt | null {
  for (let index = receipts.length - 1; index >= 0; index--) {
    const receipt = receipts[index];
    if (receipt?.source === source) return receipt;
  }
  return null;
}
