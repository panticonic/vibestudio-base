---
description: Decide whether the authorized local semantic commit or review is supported by this branch and file evidence.
args:
  goal: string
  plan: BridgePlan
  scope: DeliveryScope
  local: LocalGitReview
  spec: LocalFileReview
  note: LocalFileReview
  branch: BranchAssessment
returns: BridgeDecision
---
1. Hold on any unaligned retained branch assessment. For aligned evidence, hold if either exact semantic file is missing, its current state changed during observation, or the two reports disagree on the working or protected basis.
2. Honor read-only review once the branch and file evidence agree. A local commit also requires both exact files to carry working changes atop the same current committed basis, and the release note to describe the current delivery contract rather than an earlier obligation. Hold if those conditions fail.
3. For an authorized local commit with those conditions, return commit. Describe the decisive file or branch evidence. Keep the separation between current local state, a retained branch observation, and any future export.
