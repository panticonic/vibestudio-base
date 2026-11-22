---
description: Select the current owned eval work item that matches the user’s request.
args:
  goal: string
  jobs: EvalJobCard[]
returns: EvalJobCard | null
---
Identify the active job matching the user's project and outcome. Use labels, recorded purpose and authorized scope as evidence. Archived similarly named work does not authorize recovery or another run. Return null if the active job cannot be established.
