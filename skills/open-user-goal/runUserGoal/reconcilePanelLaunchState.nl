---
description: Reconcile requested changes with the exact owned panel launch slot and its validated native persistence.
budget: { maxTurns: 34 }
args:
  goal: string
returns: LaunchReport | null
---
1. Call workspace.listLaunchSlots and planLaunchState. Read workspace.readLaunchSlot twice for plan.panelId. If either observation is absent, return null.
2. Call decideLaunchChange on the goal, plan and both observations. For an authorized attempt, bind workspace.bindLaunchAuthority for the current digest and exact patch. Call reviewLaunchAuthority with the exact request. Only use the original plan against its current basis if the read says it is eligible. Preserve the actual effect or null.
3. Read workspace.readbackLaunchSlot even if the effect was declined or rejected. Call concludeLaunchState with the plan, both snapshots, decision, effect and independent readback. Return the actual report. Stage a private note only if plan.retain.
