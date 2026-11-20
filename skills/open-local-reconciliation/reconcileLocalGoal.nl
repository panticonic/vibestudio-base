---
description: Reconcile local project changes and prepare any authorized retained evidence assignment.
args:
  goal: string
returns: ReconcilePreparation
budget: { maxTurns: 16 }
---
1. Call discoverWindow.readWindow for the live desk record. Call reconcileProject with the unchanged goal and that window. A pending or closed window permits evidence gathering only.
2. Decide whether the user requested a retained handoff. Only for a requested handoff after verified integration call prepareEvidence with the exact final integration head. Keep the returned assignment unchanged.
3. Return the actual integration result, whether the handoff was requested, and the observed evidence request or null.
