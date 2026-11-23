---
description: Review exact retained System test evidence for a locally authorized release handoff.
args:
  goal: string
returns: SystemReleaseOutcome
budget: { maxTurns: 24 }
---
1. Call discoverRelease. Give the actual assignment to compareRuns and retain its real pair and choice.
2. If compareRuns chose a run, call evaluateCases. Keep its exact case evidence and assessment. Otherwise return the choice's hold reason, with cases and decisive evidence empty. Explain the concrete hold.
3. If the assessment chooses stage-acceptance or stage-diagnostics, call stageRelease with the actual assignment, choice, cases and assessment. Retain the actual receipt. For other dispositions the handoff is null.
4. Return assessment and actual handoff. Do not restart tests, change release state or publish anything.
