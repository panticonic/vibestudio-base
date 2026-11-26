---
description: Decide whether the authorized local semantic commit or review is supported by this branch and file evidence.
args:
  goal: string
  plan: BridgePlan
  scope: DeliveryScope
  local: LocalGitReview | null
  spec: LocalFileReview | null
  note: LocalFileReview | null
  branch: BranchAssessment
returns: BridgeDecision
---
Determine which claims, comparisons and actions the actual goal requires. Missing evidence needed for a commit or requested finding remains a reason to hold that action or identify the gap. Uninspected evidence unrelated to a readonly question is not a false observation and does not create a requirement to run every review helper.

A local commit requires the actual current semantic file changes and a single compatible working/protected basis, with the release note describing the current delivery contract. Do not commit for a readonly request, an unaligned required branch, an unresolved integration or unsupported file state. A truthful diagnosis of an unavailable/stale source can itself answer a question without promising a later export. Return the actual decision and explanation from these facts; do not infer permission from a retained successful observation.
