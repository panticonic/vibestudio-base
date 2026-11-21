---
description: Recover an interrupted server log follow and preserve exact bounded local evidence.
args:
  goal: string
returns: LogFollowerOutcome
budget: { maxTurns: 35 }
---
1. Call discoverLogFollower to obtain the assignment.
2. Call observeLogFollower with the assignment. Its response represents one real bounded watch and catch-up.
3. Call reconcileLogFollower with the assignment and capture.
4. Call classifyLogOperation with the assignment and joined result.
5. Call stageLogFollower only when the decision says to stage. Otherwise receipt is null.
Return the exact assignment, capture, joined, decision, and receipt.
