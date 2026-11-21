---
description: Decide the correct adoption disposition within the approved local scope.
args:
  goal: string
  card: AdoptionReviewCard
  evidence: AdoptionEvidence
returns: AdoptionPlan["disposition"]
---
Use hold-conflict for conflict, hold-override for bad-override, hold-epoch for epoch, hold-closure for missing-unit, and hold-duplicate for duplicate-source. For composed evidence, use explain-only when the person only asks for a readback. If they requested a file and card.mayRecord is false, use hold-authority. Use record-private only for a composed review with explicit private record authority and user intent.
