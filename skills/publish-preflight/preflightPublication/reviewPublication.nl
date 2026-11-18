---
description: Reconcile the intended provider operation with an existing publication receipt if the task requires one.
args:
  request: PublishPreflightRequest
  receipt: PublicationObservation | null
returns: PreflightReview
---
For prepare with no prior receipt, return no blockers, with evidence that the destination is staged for review. For check-existing with no receipt, require missing-publication. If a receipt is present and it conflicts with the requested target, artifact or operation identity, use different-publication regardless of phase. A correct prior receipt in a prepare task has no additional effect. For check-existing on the matching receipt, call readProgress.
