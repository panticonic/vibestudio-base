---
description: Preserve a pending Git import's exact semantic coordinates.
args:
  candidate: GitBridgeCandidate | null
returns: GitBridgeCandidateReview
---
Return candidate unchanged. If present, explain that the snapshot is an unpublished semantic candidate and the caller should compare it from the target workspace context. Otherwise explain that the current upstream result supplied no candidate.
