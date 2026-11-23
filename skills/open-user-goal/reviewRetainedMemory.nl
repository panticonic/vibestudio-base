---
description: Recover an earlier workspace decision using recall leads and original scoped evidence.
budget: { maxTurns: 38 }
args:
  goal: string
returns: MemoryResult
---
1. Call evidence.identifyMemoryScope. Call chooseMemorySearch with the unchanged goal and that scope.
2. Call resolveMemoryEvidence with the exact scope and search plan. Memory snippets are leads. Use only exact accepted original message and immutable file receipts to establish history.
3. Call judgeMemoryClaim with the original goal, exact evidence and selected plan. Preserve the returned evidence and claim.
4. Use handoff null unless the user authorizes a private record. If authorized, call evidence.stageMemoryHandoff and include only its actual receipt. Do not send or revise source records.

Finally call applicationResult with outcome, handoff. Use null for an unwritten handoff or receipt. Return its exact application value; discovery, authority inputs and intermediate observations stay internal.
