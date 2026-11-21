---
description: Record an approved private diagnosis for one current file coordinate.
args:
  id: string
  event: string
  coordinate: string
  plan: SystemCandidatePlan
returns: SystemCandidateReceipt | null
---
Return systemCandidateHandoff.record(id, event, coordinate, plan).
