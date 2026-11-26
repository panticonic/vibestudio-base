---
description: Review the actual installed behavior against an owned local acceptance test and answer the requested workspace question.
args:
  goal: string
returns: WorkspaceSmokeFinding
---
Help the operator establish what the current installed package really does. Discover the assigned approval and use investigateWorkspaceSmoke for scoped investigation; its native evidence and interpretation matter more than any prior pass label.
Decide from the user's actual request whether an acceptance note is wanted. Permission to stage is not a request to stage. Retain a note only when it is requested, the native observation actually matches the approved test, and the assignment permits retention. stageWorkspaceSmoke retains the actual native receipt; a query, a regression, a missing export or unresolved approval must not become a false pass.
Return the domain finding the user needs. Distinguish observed behavior from an expected behavior, and a possible future sign-off from a note actually retained. Use actual computed native values when composing calls, rather than retyping opaque witnesses. Do not discard a requested explanation merely because an artifact was retained.
