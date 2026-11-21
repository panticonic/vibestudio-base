---
description: Search bounded actual workspace memory for the chosen evidence kinds.
budget: { maxTurns: 4 }
args:
  query: string
  kinds: MemoryKind[]
returns: MemoryLead[]
---
Return the exact result of nativeRetainedMemory.recall(query, kinds).
