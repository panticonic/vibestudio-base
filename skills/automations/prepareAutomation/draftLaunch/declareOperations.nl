---
description: Select the exact supplied external operations this automation can foresee.
args:
  goal: string
  executor: ExecutorKind
  available: Operation[]
returns: Operation[]
---
Use entries from available only. Include an operation used on each run as action, and one used only on an explicit condition as conditional. Preserve an entry's declared use. Fixed reminders have no external acquisition plan. Keep model-facing notification, runtime bookkeeping and status readbacks carried out by the launch tool outside this plan. Never infer capabilities from a conversation identity.
