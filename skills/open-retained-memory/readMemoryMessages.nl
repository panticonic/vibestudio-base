---
description: Read the original native conversation envelopes for the owned channel.
budget: { maxTurns: 4 }
args:
  channelId: string
returns: MemoryMessage[]
---
Return the exact result of nativeRetainedMemory.transcript(channelId).
