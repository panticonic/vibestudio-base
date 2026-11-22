---
description: Read retained scope and reuse the installed planner before judging activation authority.
args:
  goal: string
returns: AutomationLaunchReview
---
1. Call readLaunchEvidence. If the user asked for review only or approval is absent, ambiguous, withdrawn, for another scope, or bound to an already active assignment, pass a null plan to chooseActivation.
2. For one current owner-approved activation, call planning.prepareAutomation with evidence.request. Preserve its actual launch or hold result. Use null for a plan unrelated to creating the job.
3. Call chooseActivation with the evidence and plan. Return the exact results together.
