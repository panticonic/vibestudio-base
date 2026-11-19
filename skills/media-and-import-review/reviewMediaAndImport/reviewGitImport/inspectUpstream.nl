---
description: Assess current remote observation and safe eligibility for a future explicit export plan.
args:
  assignment: GitReview
returns: Disposition
---
1. When status is absent return missing-evidence. Preserve auth-failed, fetch-failed and upstream-error for error; use upstream-busy for active export or push. Use no-exportable-event for export from a confirmed empty state.
2. Without observedAt use no-current-observation; lastSuccessfulObservationAt is historical only. If remoteBranchExists is false use missing-branch. If state is diverged use upstream-diverged; if behind use needs-integration.
3. For an export review without a protected-main event use no-exportable-event. For a reviewed ahead state and an explicit protected-main event use export-eligible. Otherwise use upstream-observed. Eligibility is a plan assessment only.
