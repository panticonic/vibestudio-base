---
description: Determine the current visibility and pending IDs of one approval queue.
args:
  source: ApprovalSurface
  receipts: ApprovalQueueReceipt[]
returns: ApprovalSurfaceReview
---
1. Call latestApprovalReceipt(source, receipts) to select the last matching receipt.
2. A snapshot gives state visible with its exact pending IDs in supplied order. A later snapshot gives the complete replacement set.
3. An unavailable receipt gives state unavailable with no IDs. An acknowledgement or no receipt gives awaiting-snapshot with no IDs. Return the supplied source.
