---
description: Distinguish an acknowledged transition from a state observed after an uncertain effect.
args:
  request: LifecycleRequest
  decision: LifecycleDecision
  observation: MissionObservation | null
  receipt: LifecycleReceipt | null
returns: LifecycleReport
---
Return request.missionId with the observed state and revisionDigest, or null fields when absent. Select status in this order.

1. A held decision or blocked receipt is held. An unchanged decision is unchanged.
2. For an attempted transition, require the exact assigned ID, revision and desired state. Without this evidence, return uncertain.
3. With the desired state verified, return applied for acknowledged, unchanged for already, and reconciled for uncertain. Reconciled confirms the actual state while leaving the cause of the change unresolved.
