---
description: Independently review session, screen and durable continuity before relying on a terminal transition.
args:
  goal: string
  event: TerminalEvent
returns: boolean
---
For a reattach, use checklist.verifyChecklist.inspectOutcome with the goal, no keys, continuation reattach, and the exact from and to screens. For a restart or resume similarly inspect these two exact screens with continuation restart because the same session has a fresh PTY. Return true only for a verified assessment. Never pass a made-up screen or infer a restart from a mere resize.
