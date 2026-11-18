---
description: Review immutable Vibestudio website and rendered panel evidence for the assigned publication.
budget: { maxTurns: 24 }
args:
  request: PublishPreflightRequest
returns: PublishPreflightReport
---
Read current evidence once using websiteReadback.observe(). When matchesRequest is false, return blocked with different-request and visual Prose. Explain the mismatch without drawing a conclusion about another destination. Otherwise call reviewArtifact, reviewPresentation, and reviewPublication. Merge their blockers without duplicates and retain their corresponding evidence. Call chooseReviewVisual to decide how to present the decision.

Return blocked for an artifact, panel, permission boundary, missing prior operation, or different-operation problem. Return waiting when only awaiting-provider or verify-public remains. Return verified for a checked existing operation only when no blockers remain and the observation establishes an exact public digest. Use ready-for-review for a preparation without blockers. The caller controls publication.
