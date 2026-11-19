---
description: Check the user's reporting intent and whether the current draft still supports the requested revision update.
args:
  request: ProblemRequest
  defect: DefectClass
returns: ProblemNext
---
When consent is decline, return continue-user-task. Without an explicit save or share request, continue the user task for user-code, refusal, and transient cases. Otherwise prepare-local-draft when none exists. Preserve one draft per issue. If the existing basisRevision differs from the current revision, return refresh-own-edit so the caller can re-read and reapply only their own change. For a platform account with no explicit share, return continue-local-draft when consent is unspecified, keep-local when it is save. For any other explicitly saved issue, return keep-local. For share return freeze-selected-report after the current local draft is established.
