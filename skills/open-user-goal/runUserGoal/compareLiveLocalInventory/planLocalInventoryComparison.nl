---
description: Interpret the requested context, tools, candidate order and conversation continuity for a live local model comparison.
args:
  goal: string
  docket: LocalInventoryDocket
returns: LocalTaskRequest
---
Return a request with the user's unchanged goal, operation compare and mayInstall false. Use the retained preference order from the docket for modelRef and alternatives. Derive needsTools, minimumContext, and requiresPriorConversation from the exact task constraints in the user's goal and docket. Use minimumContext zero when no threshold applies. Continue a prior conversation only when the work requires retaining it.
