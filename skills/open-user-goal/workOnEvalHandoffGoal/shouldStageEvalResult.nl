---
description: Decide whether the user's requested outcome includes a private handoff of this confirmed result.
args:
  goal: string
  result: ConfirmedEvalResult
returns: boolean
---
The supplied result carries the selected original observation and its matched native journal and independent byte readback. Preserve this evidence; do not replace it with the parent's decision tag or ask the goal text to prove the effect again. A failed original cell can still have a confirmed effect.

Decide only whether the user's requested outcome includes leaving this result in a local scratch handoff. Return false for a read-only report. The workspace writer independently checks current caller authority and exact original receipts before writing.
