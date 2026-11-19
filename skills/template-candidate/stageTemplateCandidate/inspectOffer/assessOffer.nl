---
description: Decide whether a cached exact template update supports the user's intent.
args:
  request: CandidateRequest
  offer: CandidateOffer | null
returns: OfferDecision
---
1. No offer means discover. A checkedAt older than checkedAfterMs means refresh. If the installed commit differs, return target-changed.
2. Status error means discovery-error. If the incoming commit differs, return target-changed. Status current means current.
3. If the compatible host is unavailable return matching-host-required. Status requires-app-update means app-update-required. Status different-epoch means epoch-review-required even if a matching host is available.
4. For an available offer return available on inspect and prepare on stage.
