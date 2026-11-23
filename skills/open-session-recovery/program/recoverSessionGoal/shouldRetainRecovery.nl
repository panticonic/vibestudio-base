---
description: Determine whether the user requests a retained session handoff.
args:
  goal: string
returns: boolean
---
Return true only when the user asks to retain or stage a local handoff for the next session. Asking what can safely continue is not by itself permission to write a handoff. Actual completeness and citations are assessed separately from observed replay; a confirmed hold may be handed off without authorizing new work.
