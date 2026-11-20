---
description: Follow one approval across two ordered observations of the caller's queues.
args:
  request: ApprovalTransitionRequest
returns: ApprovalTransitionReport
uses: [reviewApprovalQueues]
---
1. Call reviewApprovalQueues with the goal, caller, approvalId and earlier receipts as receipts. Keep the exact report as earlier.
2. Call the same function with the same goal, caller and approvalId and the later receipts. Keep the exact report as later.
3. Call interpretApprovalTransition with earlier and later. Return the transition and both exact reports.
