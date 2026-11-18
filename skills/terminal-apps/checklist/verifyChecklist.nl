---
description: Exercise a caller-owned release checklist by reading its real terminal screens.
args:
  request: ChecklistRequest
returns: ChecklistReport
budget: { maxTurns: 20 }
---
1. Call openSession and keep its actual screen.
2. Call editItems with the assigned keys. Keep every returned screen in order. An empty assignment makes no input calls.
3. If continuation is reattach or restart, call resumeSession with that mode and retain the post-continuation screen.
4. Call inspectOutcome with the exact request and the collected screens. Return its disposition with the actual screens and requested continuation. The caller owns the session and closes it.
