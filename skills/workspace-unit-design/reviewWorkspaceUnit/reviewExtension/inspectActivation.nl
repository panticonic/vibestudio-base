---
description: Reconcile the candidate source, context build, publication and supervised extension.
args:
  evidence: ExtensionActivationEvidence
returns: UnitReview
---
1. Cite supplied build then status ids in that order. If candidate source is uncommitted, return waiting and source-uncommitted.
2. When a build is absent or does not identify operation build, source, context, exact ctx:<context id> ref and tested state, return not-observed and exact-build-unobserved. A matching build with status failed gives revision-needed and candidate-build-failed. A build not reporting ok gives not-observed and exact-build-unobserved.
3. A verified local candidate with published false is waiting and source-not-published. If status is missing or for a different source, return not-observed and extension-status-unobserved.
4. Read the live status in order. Any pending approval means waiting and extension-review-pending. Building means waiting and extension-building. A recorded error or an error status means revision-needed and replacement-failed. A stopped, pending-approval or available process is waiting and extension-not-running.
5. A running process on another effective version is waiting and previous-version-active. A running process on the exact candidate version is ready and candidate-active.
