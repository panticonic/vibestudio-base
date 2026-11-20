---
description: Interpret the observed CLI approval queues and locate an assigned pending request.
args:
  request: ApprovalVisibilityRequest
returns: ApprovalVisibilityReport
---
1. Call selectApprovalSurfaces with request.caller.
2. In the returned order call reviewApprovalSurface for each selected source, passing request.receipts unchanged. Collect the reports as surfaces.
3. Call summarizeApprovalVisibility with surfaces to obtain coverage.
4. Call locatePendingApproval with request.approvalId, surfaces and coverage. Return coverage, surfaces and location.
