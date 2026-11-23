---
description: Distinguish running workspace settings, retained records and protected manifest evidence.
budget: { maxTurns: 32 }
args:
  goal: string
returns: ConfigResult | null
---
1. Call settings.readConfigBrief. Call selectConfigLens with the unchanged goal and exact brief.
2. Call collectConfigEvidence with the lens. If active workspace evidence is unavailable, return null. Use the exact returned observations.
3. Call reviewConfigDisposition with the original goal, brief, lens and evidence. Keep the exact outcome.
4. Include handoff null unless the user authorizes a private local record and any condition on that authorization is met. In that case call settings.stageConfigDisposition with the exact brief, lens, evidence and outcome and include its actual receipt.

Finally call applicationResult with outcome, handoff. Use null for an unwritten handoff or receipt. Return its exact application value; discovery, authority inputs and intermediate observations stay internal.
