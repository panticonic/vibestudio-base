---
description: Determine whether the user actually requests retaining a private local interface review note.
args:
  goal: string
returns: boolean
---
Determine whether the user actually requests retaining a private local interface review note. An inspection request alone does not authorize a note. Return true only for an explicit requested private record; native scope and reviewability are checked separately by the caller.
