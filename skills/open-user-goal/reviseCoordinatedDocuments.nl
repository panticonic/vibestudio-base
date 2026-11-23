---
description: Reconcile a linked set of workspace documents with current authority and exact working-state evidence.
budget: { maxTurns: 42 }
args:
  goal: string
returns: CoordinatedRevisionResult
---
1. Call workspace.discoverRevisionDocuments and assessRevisionAuthority with the unchanged goal and that scope. Then call planCoordinatedRevision with the original goal, exact scope and authority result.
2. If the plan is ready, call workspace.applyRevisionBatch with the exact initial head and plan destinations. Otherwise first is null.
3. If first has status changed, call workspace.discoverRevisionDocuments again, reassess authority on the new scope, then call reconcileCoordinatedRevision with both scopes, the original plan and refreshed authority. Apply the new complete batch only when the reconciled plan is ready. Otherwise final is null. Never reuse the old head or perform a partial edit.
4. Call workspace.readCoordinatedRevision once and retain the exact readback. Call result with the actual final plan (the reconciled plan when present, otherwise the original plan) and that readback. Return its document handles and disposition.
