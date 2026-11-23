---
description: Interpret whether this retained-history finding should be recorded privately.
args:
  goal: string
  brief: MemoryBrief
  outcome: MemoryOutcome
returns: boolean
---
Return true only for an explicitly requested private local record of this owned historical question when the actual finding satisfies the user's stated conditions. Read-only questions authorize no write. Never treat a requested message, source revision or send as authority for a private note. Return false otherwise.
