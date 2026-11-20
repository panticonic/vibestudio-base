---
description: Recover the user's work from retained Vibestudio conversations and stage a grounded handoff when requested.
budget: { maxTurns: 20 }
args:
  goal: string
returns: RecoveryReport
---
1. Discover available conversations through recoverySessions.discover. Pass the user's goal and catalog to chooseRecoverySources.
2. Read the selected conversations through readRecoveryWindows. If a cursor belongs to another conversation, consider whether the user authorized checking its source or whether the goal must stay unresolved. Use only observed authorized sources. Keep the readbacks distinct by channel.
3. Call interpretRecovery with the goal and observed windows. Preserve the exact returned disposition and citations.
4. Call stageRecoveryHandoff only if the user asked for a handoff and the relevant replay is complete enough for the intended claim. A confirmed hold can be handed off. An empty or incomplete continuation cannot authorize new work. Return the review with its actual staged receipt, or null when no handoff was written.
