---
description: Observe and assess the upstream offer against the exact assignment.
args:
  request: CandidateRequest
returns: { decision: OfferDecision; offer: CandidateOffer | null }
---
Call readOffer. Call assessOffer(request, offer) and return the actual offer and returned decision together.
