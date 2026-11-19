---
description: Diagnose one Git Bridge transfer using its live upstream and semantic VCS state.
args:
  request: GitBridgeRequest
returns: GitBridgeReport
---
1. Call gitBridgeReviewRead.observe with request.operationId. Preserve view exactly.
2. If semantic.current is false, return view, null reviews and next refresh with a reason that the semantic state moved during observation.
3. Call reviewUpstream with request.direction and view.upstream. Call reviewSemantic with view.semantic and view.upstream.candidate.
4. Give both reviews, request.direction, and the observed view to chooseBridgeStep. Return the exact view, both reviews, next and reason.
