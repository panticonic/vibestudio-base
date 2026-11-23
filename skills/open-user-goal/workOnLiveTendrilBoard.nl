---
description: Verify a presentation, approved layout or rollback, and durable state of a real local Tendril handoff board.
budget: { maxTurns: 16 }
args:
  goal: string
returns: LiveTendrilOutcome
---
1. Call findLiveTendrilTicket with the original goal. If it does not identify a unique current board, return null actual result with the missing evidence.
2. Call planLiveTendrilEffect with the unchanged goal and exact ticket. When no authorized plan can meet the request, return null actual result and a reason.
3. Call workflow.runTendril with the actual plan. Return its actual workflow result. Explain whether the visible board and retained state now support the goal. Preserve any rolled-back result and the identity of the restored build.

Return the actual workflow result or null and its concrete goal finding. The ticket and planning request stay in working calls.
