---
description: Collect protected native installed provenance and the isolated candidate composition separately.
args:
  card: AdoptionReviewCard
returns: AdoptionEvidence
---
Call readInstalledExamples with card.id. Call simulateOwnedComposition with the exact card.id and card.event. Return {installed, composition}.
