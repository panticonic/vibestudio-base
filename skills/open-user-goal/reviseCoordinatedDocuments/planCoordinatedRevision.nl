---
description: Choose linked destinations and produce a minimal justified patch for each one.
budget: { maxTurns: 16 }
args:
  goal: string
  scope: RevisionScope
  authority: RevisionAuthority
returns: RevisionPlan
---
When any necessary authority is missing or the user only wants findings, return held with empty destinations. For each requested path positively identified from the goal and exact documents, call policy.chooseRevision with the instruction for that one destination, the actual documents and null for public research. Never include authority files or unrelated sections as targets.
Return held if a required destination or edit is ambiguous. Otherwise return each actual changed destination ordered by path, excluding unchanged documents. Use already-aligned with empty destinations when all requested changes are already present. Use ready for the exact complete actionable batch.
