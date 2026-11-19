---
description: Review a Vibestudio problem and select a safe report preparation or submission step from the actual draft and receipts.
uses: [classifyDefect]
args:
  request: ProblemRequest
returns: ProblemReviewReport
---
Call classifyDefect on request.account and qualifyEvidence on request. Keep the defect classification even if the user asked to report a different kind of problem. Call chooseDraftAction for whether and how to prepare a local revision. When the returned action is freeze-selected-report, call prepareSubmission for the exact frozen snapshot and approval. Return the actual action, evidence, defect and draft basis or null. Everything is an assessment. Saving and submission remain actions on the owning report service.
