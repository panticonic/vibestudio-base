---
description: Generate or reuse a durable owned illustration and preserve its exact original when authorized.
args:
  goal: string
returns: OwnedIllustrationReport
budget: { maxTurns: 50 }
---
1. Call discoverIllustration(), then inspectIllustrationBasis(assignment) for destination, retained attempt, and current approvals.
2. Use chooseIllustrationAction(assignment, basis) to decide whether new generation, a retry, a known terminal original, or a hold serves this goal.
3. For a chosen action other than hold, call runIllustrationJob(assignment, basis, decision). Keep the exact native result, including failed or canceled status.
4. Only with save authority and a verified original result call retainIllustrationOriginal(assignment, basis, outcome). Keep its exact saved or stale report. Otherwise saved is null.
Return assignment, basis, decision, outcome and saved. No output bytes, unrelated jobs or public publishing.
