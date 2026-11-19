---
description: Find concrete omissions or contradictions before a caller can launch a derived automation plan.
args:
  request: AutomationRequest
  draft: LaunchDraft
returns: string[]
---
Check that the declaration can perform the user's requested work at the selected cadence and conversation scope. A fixed reminder needs exact supplied text. An action depending on an external operation requires a matching entry in the caller's catalog; a service guess is a blocker. Do not require operations for built-in notification or scheduling. Report only blocking ambiguities or mismatches, one concrete reason each. Return an empty list when the declaration is ready.
