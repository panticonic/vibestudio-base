---
description: Obtain persisted launch-state readback and requested related-record evidence.
args:
  goal: string
  index: LaunchIndex
  plan: LaunchPlan
  earlier: LaunchObservations
  decision: LaunchDecision
  effect: LaunchEffect | null
  readSlot: "(panelId: string) => Promise<LaunchSnapshot | null>"
  sealSlot: "(panelId: string) => Promise<LaunchSnapshot | null>"
returns: LaunchVerification | null
---
Obtain the selected active slot's persisted readback through sealSlot. If the user's requested check concerns a related owned record, acquire its actual current snapshot through readSlot and retain it in companions for comparison with earlier evidence. The index and exact native IDs determine which records are owned; a title match does not make a record the selected write target. Do not seal or mutate companions. Do not inspect unrelated slots by default. Refusal or missing evidence must remain explicit: return null when essential readback cannot be obtained. Do not infer that a companion is unchanged from the active slot's state.
