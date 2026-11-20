---
description: Decide what the installed and deployed interface evidence supports under the current local review scope.
args:
  goal: string
  survey: InterfaceSurvey
  observation: InterfaceObservation
  architecture: ArchitectureReport | null
returns: InterfaceFinding
budget: { maxTurns: 13 }
---
1. Hold for a kind mismatch first, then a review scope assigned to a different source, then a stale revision or definition digest. Return held-kind, held-assignment, or held-stale respectively.
2. A withdrawn review or proposal to widen access cannot proceed here. Return held-authority. A review can inspect an existing allowance but does not grant cross-workspace or website access or permit a runtime update. Use held-ownership when the native Architecture result demands a correction or finds a mismatch.
3. An installed declaration alone cannot attest an active deployed method. When the review requires the exact currently deployed method, require a bound immutable artifact and the matching diagnostic method. Return held-deployed if unavailable, ambiguous or different; otherwise deployed-method-confirmed. An active extension registration establishes only the method name on the exact deployed release; do not infer input signatures or cross-workspace or website permissions.
4. For an authorized declaration-level inspection return reviewable. Include the exact evidence basis in the reason, explain the scope of any permitted local review, and make no broader operational claim.
