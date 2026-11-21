---
description: Bind the exact source selection and authorized project action to the observed working revision.
args:
  evidence: ProjectEvidenceReview
  decision: ProjectEvidenceDecision
returns: ProjectScopeLease
---
Return contentProjectScope.confirm(evidence.revision, decision).
