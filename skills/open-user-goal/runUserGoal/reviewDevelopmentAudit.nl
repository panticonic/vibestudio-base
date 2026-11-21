---
description: Review the exact retained development run and stage only an approved repair hold.
args:
  goal: string
returns: DevelopmentAuditOutcome
budget: { maxTurns: 30 }
---

Review the exact retained development build addressed by the user's goal.
1. Call discoverDevelopmentAudit() to obtain the assigned run and review scope.
2. Call inspectDevelopmentRuns(assignment) for independent exact branch evidence.
3. Call chooseDevelopmentRun(assignment, observed) to match run, session and approval.
4. Call assessDevelopmentRepair(assignment, observed, choice) for the settled disposition.
5. For keep-repair only, call keepDevelopmentRepair on the observation whose id is choice.runId and retain its actual receipt. For all other dispositions report a null receipt.
Return assignment, observed, choice, assessment and receipt verbatim.
