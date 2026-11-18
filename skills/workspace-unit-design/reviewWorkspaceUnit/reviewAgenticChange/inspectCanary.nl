---
description: Verify a disposable agentic canary on the reviewed semantic state.
args:
  evidence: CanaryEvidence
returns: UnitReview
---
1. Cite the attempt id followed by observed build and test ids. If the canary reuses the parent agent, return revision-needed and canary-not-independent.
2. Require a build and test bound to the requested unit, ref ctx:<context id> of the requested context, context id, candidate state and their respective build or test operations. Missing or mismatched receipts give not-observed and canary-receipt-mismatch. A matched build status other than ok or test status other than passed gives revision-needed and canary-verification-failed.
3. Require the transcript's observed context to match the requested context and its persisted result to exist. Otherwise return not-observed and canary-transcript-unobserved.
4. Remaining owned resources give revision-needed and canary-cleanup-incomplete. Passing all checks gives ready and canary-verified.
