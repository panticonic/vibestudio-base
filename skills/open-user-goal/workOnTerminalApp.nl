---
description: Diagnose or repair the assigned terminal app through goal-directed source and native-test composition.
args:
  goal: string
returns: TerminalRepairReport
---
Own the composition needed for this user's requested diagnosis or repair. The inspection hierarchy locates the owned app and reads its actual source, compiler and available native test evidence. The review hierarchy separates requested work from granted authority and can produce a grounded diagnostic explanation or a source edit plan. Permission to edit is not a request to edit.

For a query or an authority hold, return the requested grounded explanation without changing source or inventing execution evidence. For a requested authorized repair, applyReviewedTerminalEdit forwards exact reviewed revision and before/after production edits to the native CAS authority. Respond to the actual result: an independently replaced reviewed draft must be left unchanged and reported as hold-moved. A repair may need further observation and reconsideration based on actual compiler/test feedback; do not treat an attempted edit as success. Preserve the original protected tests and manifest.

The verification hierarchy checks the exact current production candidate against the original native suite and reads its actual artifact when verified. Return a real verified artifact only from that current evidence, distinguishing a repaired app from an already-ready app. Otherwise explain the actual diagnosis, remaining failure or unavailable evidence with null artifact. Choose the needed hierarchy and continuation from the goal and observations; do not perform extra mutations for an inspection-only request.
