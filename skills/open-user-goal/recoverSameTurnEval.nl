---
description: Complete one user's current task after a bounded local eval error or truncated output.
args:
  goal: string
returns: SameTurnEvalOutcome
budget: { maxTurns: 35 }
---
1. Call discoverSameTurnEval to read the exact current user assignment.
2. Call inspectSameTurnEval on that assignment. Preserve the native tool disposition and candidate provenance.
3. Call chooseSameTurnRecovery with assignment and evidence.
4. If the decision is held, leave recovery null. Otherwise call resolveSameTurnEval with assignment, evidence and pick, retaining its exact observation for the user.
Return pick and recovery.

Return pick and actual recovery result or null. The assignment and native attempt observation remain working context.
