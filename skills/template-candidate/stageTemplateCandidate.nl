---
description: Inspect the selected workspace template offer and prepare its isolated review context when authorized.
budget: { maxTurns: 24 }
args:
  request: CandidateRequest
returns: CandidateReport
---
1. Call inspectOffer(request). For any status other than prepare, return that status and offer with null operationId and candidate.
2. Call prepareCandidate once. For offer-changed, return that status and the original offer, with null operationId and candidate.
3. Give the receipt and request to reconcileCandidate. Return that result's status and candidate together with the original offer and request.commandId.
