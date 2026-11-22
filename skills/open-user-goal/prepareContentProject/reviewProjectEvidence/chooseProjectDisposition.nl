---
description: Decide how much of the project can be prepared and which exact source records support it.
args:
  goal: string
  evidence: ProjectEvidenceReview
returns: ProjectEvidenceDecision
---
1. Read the goal, project destination, audience, requirements, safety and local approval. An occupied destination blocks new creation. Missing or conflicting current requirements or an unresolved safety record also block creation. Retired records may explain the change but do not authorize the current deliverable.
2. Use commit only if requested, all current evidence needed by the goal is present, and the current owner record grants a local commit. Use draft only when the user permits a private working draft and the source evidence permits it. Treat a pending or absent approval for the only requested action as a hold.
3. For each selected fact use the record ID, current digest, and fact ID exactly, preserving order by observed records and facts. Include all applicable current requirements, safety and explicitly recorded approval facts in a draft or commit. Set basis to authorized for a permitted draft or commit. On a hold, keep the exact evidence and use occupied, missing, conflict or pending for the specific obstacle. Return no selected citations on a hold. A copy, an old approval, or a well-written draft does not prove current authorization.
