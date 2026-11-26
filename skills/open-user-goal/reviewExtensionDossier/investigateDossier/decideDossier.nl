---
description: Determine whether an exact extension verification or retained rollback dossier can proceed.
args:
  assignment: DossierAssignment
  review: ExtensionReleaseReview
  candidate: CandidateComparison
  history: ReleaseHistory
returns: DossierFinding
budget: { maxTurns: 15 }
---
1. A scope with another name, source, or candidate tree is stale-owner-scope. A withdrawn or publish grant, or a rollback request lacking the exact local rollback grant, is outside-local-scope.
2. For rollback, first require a consistent receiver, then the exact requested previous build verified from immutable metadata. Return release-evidence-conflict for the former failure or rollback-not-retained for the latter. A confirmed prior release yields record-retained-rollback even if the current candidate needs separate work.
3. For a working candidate, invalid manifest declarations yield candidate-incompatible; new authority yields authority-review-required. If separate local verification is needed, return verify-local-candidate. That permits a plan for verification, not a claim that verification is complete or that the local changes are active.
4. For published-package, a receiver conflict yields release-evidence-conflict. Waiting for approval, a build, or inspection of a failure yields wait-for-release. Otherwise use record-current-comparison, identifying what the current runtime evidence can actually show.
5. Explain the evidence basis and next authorized local action briefly.
