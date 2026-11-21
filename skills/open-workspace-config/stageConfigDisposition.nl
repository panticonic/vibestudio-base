---
description: Store the authorized private decision with its verified original evidence.
budget: { maxTurns: 4 }
args:
  brief: ConfigBrief
  lens: ConfigLens
  evidence: ConfigEvidence
  outcome: ConfigOutcome
returns: ConfigDisposition | null
---
Return the exact result of nativeConfigHandoff.stage(brief, lens, evidence, outcome).
