---
description: Verify a presentation, approved layout or rollback, and durable state of a real local Tendril handoff board.
budget: { maxTurns: 16 }
args:
  goal: string
returns: LiveTendrilOutcome
---
1. Call findLiveTendrilTicket with the original goal. If it does not identify a unique current board, return null card, plan and actual result with the missing evidence.
2. Call planLiveTendrilEffect with the unchanged goal and exact ticket. When no authorized plan can meet the request, return the card and null plan and actual result.
3. Call workflow.runTendril with the actual plan. Return its observations and original plan with the exact ticket card. Explain whether the visible board and retained state now support the goal. Preserve any rolled-back result and the identity of the restored build.
