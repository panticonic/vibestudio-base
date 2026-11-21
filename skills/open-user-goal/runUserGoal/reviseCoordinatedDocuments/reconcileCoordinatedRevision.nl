---
description: Recover an atomic coordinated revision after native working-head conflict.
budget: { maxTurns: 16 }
args:
  goal: string
  original: RevisionScope
  plan: RevisionPlan
  latest: RevisionScope
  authority: RevisionAuthority
returns: RevisionPlan
---
If refreshed evidence withdraws or changes the necessary authority, return held without editing. Otherwise, for each original planned destination, compare original and latest fileId and path and call policy.reconcileRevision with the actual original target, earlier proposed text, latest target, freshly observed documents and null for public research. Hold if identity changed or any required revision is ambiguous or incompatible.
Keep unrelated newer material. Exclude a target whose intended change is already present, return already-aligned if none need a change, or ready for the exact remaining justified destinations.
