---
description: Choose the complete least-authority evidence route for a local workspace goal, then verify its exact result.
budget: { maxTurns: 42 }
args:
  goal: string
returns: RouteResult
---
1. Call workspace.discoverEvidenceRoutes. Call inspectExactRouteAuthority with the offer's unchanged preflight request and keep all reviews.
2. Call selectEvidenceRoute with goal, offer and reviews. Execute only the exact selected local route with workspace.readSelectedEvidenceRoute when choice.execute is true. Keep the independent result or null. There is no external execution path.
3. Call concludeEvidenceRoute with the original goal, offer, full authority review, choice and readback. Keep the exact outcome. If an explicit private note is authorized, call workspace.stageRouteReview with handoff null and include its actual receipt.

Finally call applicationResult with readback, outcome, handoff. Use null for an unwritten handoff or receipt. Return its exact application value; discovery, authority inputs and intermediate observations stay internal.
