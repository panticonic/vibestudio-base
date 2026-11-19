---
description: Plan a coordinated change to the installed Vibestudio agentic stack at the caller's current workspace revision.
args:
  request: AgenticChangeRequest
returns: AgenticChangePlan
---
1. Call readSource with request.contextId. Use the installed guides to reason about the requested behavior.
2. Call reviewImpact with the goal and observed guides. If impact has blockers, return it with null builds and canary.
3. Otherwise call planVerification with the goal and impact. Return its builds and canary with impact. In either case copy contextId and revision from the observation. This is a plan for an exact source revision. Never report an edit, test, canary or publication as complete.
