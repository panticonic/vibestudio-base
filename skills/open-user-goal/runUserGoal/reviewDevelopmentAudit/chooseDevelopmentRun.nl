---
description: Review owned retained development evidence.
args:
  assignment: "DevelopmentAssignment"
  observed: "DevelopmentPair"
returns: "DevelopmentChoice"
---
1. Consider the requested run. If it is unavailable and the assignment allows an alternate, consider the observed alternate. Never substitute an alternate for a visible but mismatched requested run.
2. If no candidate is available, return null runId and hold-no-owned-run.
3. Require candidate.session to be the assigned session. Otherwise return null runId and hold-wrong-session.
4. When the assignment specifies an approval digest, require the exact candidate snapshot to match. Otherwise return null runId and hold-stale-approval.
5. Return the candidate id and null blocker.
