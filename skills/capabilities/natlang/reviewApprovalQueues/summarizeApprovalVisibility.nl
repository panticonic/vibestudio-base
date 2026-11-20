---
description: Assess whether the caller has seen every approval queue it can consult.
args:
  surfaces: ApprovalSurfaceReview[]
returns: ApprovalVisibility
---
Return complete when every selected surface is visible, partial when at least one but fewer than all are visible, and unknown when none is visible. A visible snapshot can contain zero pending approvals.
