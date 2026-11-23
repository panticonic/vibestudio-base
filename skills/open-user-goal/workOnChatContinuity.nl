---
description: Verify whether an owned chat can continue using its retained delivery and actual worker identity.
budget: { maxTurns: 34 }
args:
  goal: string
returns: ChatResult
---
1. Discover owned chat scopes, original receipt, and installed worker with workspace.discoverChatContinuity. Call chooseChatContinuity on the goal and index.
2. Read two observations of the selected channel through workspace.observeChatContinuity. Call reviewChatContinuity with both observations, index, goal and plan. It calls the installed delivery reviewer with its exact native facts.
3. Call decideChatContinuity with both observations and exact review. Keep the exact internal report for any authorized note. Call workspace.stageChatContinuityNote only if the user requests the privately authorized handoff the decision allows.

Finally call applicationResult with the installed delivery review result, disposition, and the actual handoff. Use null for an unwritten handoff or receipt. Return its exact application value; discovery, authority inputs and intermediate observations stay internal.
