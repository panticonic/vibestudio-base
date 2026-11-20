---
description: Construct a minimal complete patch for the real production source and current authorized behavior.
args:
  goal: string
  diagnosis: RolloutDiagnosis
returns: RolloutProposal
---
1. Use only paths in diagnosis.files. Each edit contains the entire original before text and entire proposed after text. Preserve existing interface, loader entry, source permissions, and unrelated or competing changes.
2. Repair the behavior the user needs rather than weakening its checks. Return no edits if no change is supported or necessary. State why this exact source change addresses the failure.
