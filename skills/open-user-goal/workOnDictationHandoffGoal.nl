---
description: Recover retained offline dictation and verify an owned local draft handoff.
budget: { maxTurns: 30 }
args:
  goal: string
returns: DictationResult
---
1. Discover owned threads once. Use identifyDictationThread to choose the requested draft conversation. Read its retained snapshot twice, preserving the earlier and current frontiers.
2. Call reconcileDictationSegments with the exact thread, both snapshots and unchanged goal. For a retained transcript, call reviewRetainedDictation with that original text and goal. Otherwise use null review.
3. Call decideDictationHandoff. Stage the exact plan and installed review result only for stage-correction or stage-alternative. Keep the exact plan, review and actual receipt.

Finally call applicationResult with plan, the actual draft review witness, and handoff. Return its exact domain result; repeated review requests and native observation audit stay internal.
