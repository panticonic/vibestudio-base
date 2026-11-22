---
description: Select exact native evidence that settles the adoption question.
args:
  goal: string
  evidence: AdoptionEvidence
returns: string[]
---
For a failed composition return the single exact issue string. For a composed case use the question to select exact entries from privateFiles, pulledUnits and settings, or the minimumAppVersion for an app-version question. To report the effective owner of the ground-truth Examples unit, use composition.owner. Do not combine unrelated facts.
