---
description: Decide whether the current composition evidence may be recorded privately.
args:
  goal: string
  card: AdoptionReviewCard
  evidence: AdoptionEvidence
returns: AdoptionPlan
budget: { maxTurns: 12 }
---
1. Call chooseAdoptionDisposition with goal, card and evidence. Distinguish ownership conflicts, wrong overrides, duplicate registration, incompatible epoch, and missing closure.
2. Call selectAdoptionProof with goal and evidence. Cite exact paths or native effective settings needed to answer. Use the native refused issue for failed compositions, never invent an override or an owner for a rejected composition.
3. Return the chosen disposition, a short evidence-grounded finding, and exact proof. The only supported action is recording the approved local review without deployment.
