---
description: Review the actual live Git Bridge and protected semantic basis for the selected local project.
args:
  goal: string
  scope: DeliveryScope
  operationId: string
returns: LocalGitReview
---
Call bridge.reviewGitBridge with the exact operationId, unchanged goal, scope repository and direction "diagnose". Keep its actual result. Use this as current local evidence. The separately retained external record has its own provenance.
