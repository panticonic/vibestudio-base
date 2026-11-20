---
description: Reconcile local project changes and prepare any authorized retained evidence assignment.
args:
  goal: string
returns: ReconcilePreparation
budget: { maxTurns: 16 }
---
1. Call discoverWindow.readWindow for the live desk record. If the user asks about an earlier owned note, call reconcileProject.observeProject for the exact original source comparison and call recoverPrior with the unchanged goal, that comparison and the initial window. Hold if that evidence is a prerequisite and remains unresolved.
2. Call reconcileProject with the unchanged goal, the actual initial window and any recovered source. A pending or closed window permits evidence gathering only.
3. Decide whether the user requested a retained handoff. Only for a requested handoff after verified integration call prepareEvidence with the exact final integration head. Keep the returned assignment unchanged.
4. If a prior record was recovered, call comparePrior with its actual bytes and the exact final integration head. Return the actual integration result, whether the handoff was requested, the observed evidence assignment or null, and the prior comparison or null.
