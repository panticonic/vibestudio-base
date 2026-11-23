---
description: Determine whether the user requests retaining the private release assessment.
args:
  goal: string
returns: boolean
---
Return true only when the original user goal requests retaining a private readiness record or handoff for this release assessment. An assessment request alone is not a request to write a record. This judgment does not grant workspace authority; the caller separately checks the current native retention authorization and readiness.
