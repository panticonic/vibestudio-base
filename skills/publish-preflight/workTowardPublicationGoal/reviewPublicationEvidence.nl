---
description: Establish the requested current/pre-existing publication evidence without changing its native scope.
args:
  goal: string
  binding: PublicationGoalBinding
returns: PublicationGoalEvidence
uses: [preflightPublication, reviewPublicationRevision]
---
Determine which of the bound current preflight and retained revision comparisons bears on this goal. Compose those actual semantic review functions using only the Native requests present in the binding. The checks have distinct purposes: a retained review does not establish a current package or destination is unchanged, and current package readiness does not establish hosted progress or approval.

Acquire the requested evidence, overlapping independent reads when appropriate and preserving any explicit ordering or data dependency. Return actual results, with null for an investigation not performed or not bound. Do not fabricate a request, treat an absent comparison as unchanged approval, or perform a publication action.
