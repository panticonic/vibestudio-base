---
description: Recover an owned agent capability step from its exact native attempt and current notebook state.
args:
  goal: string
returns: AgentCapabilityOutcome
budget: { maxTurns: 24 }
---
1. Call discoverAttempts, then inspectAttempt with the assignment and the unchanged goal. Preserve the current and earlier attempts and their actual native evidence.
2. Call decideContinuation with the assignment and evidence. When it returns confirm-continuation or retry-exact-step, call continueCapability with the exact current evidence and decision. Otherwise leave continuation null.
3. Return the exact assignment, evidence, finding and actual continuation result. Use the canonical terminal receipt and scope readback to distinguish a recorded effect from an error or console preview. Preserve all unrelated scope values, any cancelled attempt and the prior notebook.
