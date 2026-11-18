---
description: Check the scope and policy prerequisites for one workspace route.
args:
  evidence: { id: string; sourceWorkspace: string; targetWorkspace: string; sourceContext: string; observedContext: string; outgoing: boolean; incoming: boolean; receiverExposed: boolean }
returns: UnitReview
---
1. If observedContext differs from sourceContext, return revision-needed and finding context-scope-mismatch. If targetWorkspace equals sourceWorkspace, return ready with finding route-prerequisites for this local route. For a route between different workspaces use the next three checks in order.
2. A false outgoing policy gives revision-needed and finding outgoing-policy. A false incoming policy gives revision-needed and finding incoming-policy. If the receiver has no declared exposure, return revision-needed and finding receiver-exposure.
3. Otherwise return ready with finding route-prerequisites. This establishes route prerequisites only; authorization is separately governed. Cite evidence.id.
