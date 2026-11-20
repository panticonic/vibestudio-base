---
description: Reconcile local project changes from owned native evidence and retain an authorized local handoff.
args:
  goal: string
returns: ReconcileResult
budget: { maxTurns: 16 }
---
1. Call discoverWindow.readWindow to read the live desk record. Call reconcileProject with the unchanged goal and that window. A pending or closed window permits evidence gathering only.
2. If the user wants a handoff and reconciliation is integrated, call retainEvidence with the exact completed working revision. If a prerequisite remains unsettled, report the handoff held. If the user only asked for integration or diagnosis, report handoff none.
3. Read the window again. Report the actual latest window, integration result and observed handoff receipt. Keep an integrated decision distinct from a subsequent closure that prevented staging evidence.
