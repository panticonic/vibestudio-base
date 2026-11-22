---
description: Decide whether the user requested and authorized a local scratch assembly draft for the observed result.
args:
  goal: string
  allowed: boolean
  plan: AssemblyPlan
returns: boolean
---
Only return true when an explicit local scratch draft is requested, allowed is true, and the plan is ready or draft-repair. Do not write for a hold or unchanged result. A local draft does not authorize managing the installed source, committing, or publishing.
