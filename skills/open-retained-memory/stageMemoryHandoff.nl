---
description: Record authorized local findings and exact citations.
budget: { maxTurns: 4 }
args:
  brief: MemoryBrief
  plan: MemoryPlan
  evidence: MemoryEvidence
  outcome: MemoryOutcome
returns: MemoryNote | null
---
Return the exact result of nativeMemoryHandoff.stage(brief, plan, evidence, outcome).
