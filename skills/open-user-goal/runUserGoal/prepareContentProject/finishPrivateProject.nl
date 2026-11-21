---
description: Preserve the authorized private draft or locally commit the exact reviewed candidate.
args:
  decision: ProjectEvidenceDecision
  scope: ProjectScopeLease
  draft: AuthoredProjectDraft
returns: PrivateProjectFinish
---
- For a ready draft when the decision was draft, return the exact candidate with outcome draft and null event.
- For a ready candidate when the decision was commit, call commitReviewedProject with the scope and exact reviewed candidate. Return outcome committed only with an actual local commit event. If the required current basis moved, return held-moved with the actual candidate and no event.
- If candidate review remains incomplete, return review-needed with the observed draft snapshot if one exists.
