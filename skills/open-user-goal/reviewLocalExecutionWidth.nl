---
description: Reconcile owned local model readiness with actual retained execution-width evidence.
args:
  goal: string
returns: LocalWidthOutcome
budget: { maxTurns: 20 }
---
1. Call discoverWidth and readiness.localModelReadiness. Retain the exact responses, including unavailable or startable model rows.
2. Ask assessExecution to choose the eligible current model and provider and verify the requested workload against its scoped completed evidence. Retain the exact distinct advertised and witnessed widths.
3. When the user requested a local handoff and the current release permits this disposition, call stageWidth with the finding. Return the actual receipt or null. Never launch, install or call a model as part of this review.
4. Return the grounded execution-width finding and actual handoff.
