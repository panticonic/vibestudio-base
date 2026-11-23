---
description: Decide how much of the project can be prepared and which exact source records support it.
args:
  goal: string
  evidence: ProjectDispositionEvidence
returns: ProjectDispositionChoice
---
1. Read the goal, project destination, audience, requirements, safety and local approval. An occupied destination blocks new creation. Missing or conflicting current requirements or an unresolved safety record also block creation. Retired records may explain the change but do not authorize the current deliverable.
2. Interpret the requested disposition by meaning, not a required phrase or keyword combination. Permissions describe allowed workspace state; they do not prescribe wording. Use commit only if requested, all current evidence needed by the goal is present, and the current owner record grants a local commit. Use draft only when the user permits a private working draft and the source evidence permits it. Treat a pending or absent approval for the only requested action as a hold.
3. Select each supporting fact by its supplied local handle; TypeScript binds those choices to exact observed source, digest and fact identities. The selected references are a set; their serialization order is not an authorization condition. Include all applicable current requirements, safety and explicitly recorded approval facts in a draft or commit. Set basis to authorized for a permitted draft or commit. On a hold, keep the exact evidence and use occupied, missing, conflict or pending for the specific obstacle. Return no selected citations on a hold. A copy, an old approval, or a well-written draft does not prove current authorization.
