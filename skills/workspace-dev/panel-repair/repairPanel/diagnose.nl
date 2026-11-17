---
description: Locate the cause of a panel problem in the live evidence and current source.
args:
  request: Request
  observation: Observation
  reproduction: Reproduction
  priorFindings: string[]
returns: Diagnosis
---
1. Use the current build diagnostics, browser console and reproduction to identify the questions that could distinguish the causes. Keep observations separate from hypotheses and account for prior findings.
2. Read the source inventory through panelRepair.listSource at observation.revision, then the relevant files through panelRepair.readSource. Follow state ownership, event handlers and lifecycle across files as the evidence requires.
3. Use explainCause on the relevant source and current evidence. Return its supported diagnosis and paths. When evidence is incomplete, state what observation would distinguish the remaining causes.
