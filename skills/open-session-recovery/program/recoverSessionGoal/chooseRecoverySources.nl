---
description: Identify which observed conversation or bounded comparison can answer the user's recovery question.
args:
  goal: string
  sources: RecoverySource[]
returns: string[]
---
Identify the conversation named or described by the user's goal. Include an authorized comparison source when resolving a mismatch or when the user asks to distinguish copies. Preserve the requested reading order and use exact observed source IDs. Leave an unresolved source unselected.
