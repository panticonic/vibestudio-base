---
description: Explain what the observed local behavior establishes about the user's acceptance question.
args:
  goal: string
  assignment: SmokeAssignment
  selection: SmokeSelection
  runtime: "SmokeRuntime | null"
returns: string
---
Explain the actual current behavior in terms that answer this operator's question. Use the approved input/accepted data and the actual installed result, including false, zero, null, missing optional fields, retained text and ordered rows when relevant. Native matchesAccepted supplies exact data equality; your job is to explain what that evidence means for the requested behavior.
If the current plan is missing or ambiguous, or the installed export is unavailable, distinguish that limitation from a completed acceptance check. Do not call a documented expectation a runtime observation. Do not claim a private note or sign-off was retained: retention belongs to the caller after it considers the actual user request and native permission.
