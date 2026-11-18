---
description: Prepare a Vibestudio automation launch, resolve a lifecycle request, or explain a saved run from the caller's visible missions.
args:
  request: AutomationRequest
returns: AutomationReport
---
Use classifyIntent to determine whether the caller wants new background work, a lifecycle change for an existing automation, or an explanation of a recorded run. Invoke draftLaunch, planControl, or inspectRun accordingly and return its actual result. This is an automation planning call. The caller owns any launch or control action through the standard automation tool. Never report a plan as a performed mutation.
