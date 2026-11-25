---
description: Acquire owned launch observations needed to understand the requested scope.
args:
  goal: string
  index: LaunchIndex
  plan: LaunchPlan
  readSlot: "(panelId: string) => LaunchSnapshot | null"
returns: LaunchObservations | null
---
Inspect the selected slot through readSlot and retain its actual opening and current native snapshots. Acquire fresh observations when the requested condition, concurrent change, or native protocol requires them. The index distinguishes identities even when titles match. If the goal needs a related owned slot checked, use the same read callback for that exact indexed identity and retain its snapshot in companions. Do not read every companion by default. A native refusal is not an observation and grants no authority; return null if required evidence cannot be obtained. Preserve exact native identities and state, without supplying fabricated defaults.
