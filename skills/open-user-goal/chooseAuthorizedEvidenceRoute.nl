---
description: Choose the complete least-authority evidence route for a local workspace goal, then verify its exact result.
budget: { maxTurns: 42 }
args:
  goal: string
returns: OwnedRouteReview
---
1. Call workspace.discoverEvidenceRoutes. Call inspectExactRouteAuthority with the offer's unchanged preflight request and keep all reviews.
2. Call selectEvidenceRoute with goal, offer and reviews. Execute only the exact selected local route with workspace.readSelectedEvidenceRoute when choice.execute is true. Keep the independent result or null. There is no external execution path.
3. Call concludeEvidenceRoute with the original goal, offer, full authority review, choice and readback. Return the entire outcome. If an explicit private note is authorized, call workspace.stageRouteReview with handoff null and include its actual receipt.
