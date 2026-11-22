---
description: Diagnose an exact staged System template delta and prepare its authorized private handoff.
args:
  goal: string
returns: SystemCandidateOutcome
budget: { maxTurns: 22 }
---
1. Call findSystemCandidate with the original goal. Call readCandidateEvidence with the goal and selected card.
2. Call planCandidateHandoff with the original goal, current card and actual preview. Confirm the exact working event and selected preview coordinate with checkCandidateCurrent.
3. When the gate reports a moved frontier, call holdMovedCandidate, recording no artifact. Otherwise, if the returned plan calls for one private note, call recordCandidateHandoff with the exact id, event and coordinate. Do not apply any resolution.
4. Call verifyCandidateHandoff on the exact card id and actual receipt path or null. Return the real card, frontier, preview, plan, gate, receipt and readback with scope "owned-system-template-conflict-review".
