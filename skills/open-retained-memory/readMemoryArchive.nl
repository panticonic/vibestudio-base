---
description: Resolve a recalled event to its native immutable record.
budget: { maxTurns: 4 }
args:
  eventId: string
returns: MemoryFile | null
---
Return the exact result of nativeRetainedMemory.archivedFile(eventId).
