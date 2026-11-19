---
description: Decide which requested behaviors are supported by concrete observations.
args:
  required: string[]
  observed: string[]
returns:
  { supported: string[]; missing: string[] }
---
For each required behavior, check whether the observations establish it. Keep the behavior's wording unchanged in exactly one output list. Put it in supported when the observations give direct support. Otherwise put it in missing. A proposed change, a successful operation without its result, or a claim contradicted by an observation leaves the behavior missing. Do not infer extra observations.

Read the workspace-evidence skill when the distinction between a tool receipt and verified behavior affects a requirement.
