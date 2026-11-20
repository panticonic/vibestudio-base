---
description: Retain independently verified evidence for the current integrated revision using the installed scratch skill.
args:
  head: string
returns: RetainedResult
---
1. Call releaseEvidence with the exact verified head. If the workspace refuses it, return held and null. If it returns an assigned request, preserve it unchanged.
2. Call scratch.assembleHandoff with that exact request. Return staged with the actual artifact only if the scratch skill observed a verified staging receipt. For an unavailable, unanswered, or unverified handoff return held and null.
