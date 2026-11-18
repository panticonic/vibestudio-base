---
description: Check the exact upstream target and identity-joined semantic import receipt.
args:
  assignment: GitReview
returns: Disposition | null
---
When status exists its repoPath, remote, and branch must match the request, otherwise return wrong-input. For integration-required or a pending candidate, return needs-integration when the pending row or its independent import receipt is absent. When both are present all context and event ids must match, the source must be Git and name the assigned repository in targetRepositoryIds, and sourceUri, revision, snapshotDigest and canonicalSnapshot must be present. Use candidate-mismatch for an unmet requirement. A matching candidate whose event differs from independently observed protectedMainEventId is unpublished-candidate. A pending status still requires integration if the main event is already the same. Otherwise return null.
