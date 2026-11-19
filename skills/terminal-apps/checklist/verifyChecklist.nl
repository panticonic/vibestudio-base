---
description: Exercise a caller-owned release checklist by reading its real terminal screens.
args:
  request: ChecklistRequest
returns: ChecklistReport
budget: { maxTurns: 20 }
---
1. Call openSession and keep its actual screen.
2. For explicit keys, use the assigned sequence. For a target, call planEdits with the goal, target and initial checked items, then use targetChecks.matchesPlan to verify the returned keys. If the plan does not contain exactly the needed toggles, return mismatch with the initial screen and requested continuation. Otherwise call editItems with the keys and keep every returned screen in order. An empty assignment makes no input calls.
3. If continuation is reattach or restart, call resumeSession with that mode and retain the post-continuation screen.
4. Call inspectOutcome with the goal, executed key sequence, requested continuation and the collected screens. For a target, require targetChecks.matchesTarget on the actual final screen as well. Return the verified disposition with the actual screens and requested continuation. The caller owns the session and closes it.
