---
description: Decide whether a current Testkit closeout supports the requested local handoff.
budget: {maxTurns: 14}
args:
  goal: string
returns: CloseoutReport
---
1. Call discoverCloseoutAttempts with the unchanged goal. Keep the named current and prior attempts distinct.
2. Call readAttempt for each exact returned handle with that goal. Compare the current outcome, callback acknowledgements and remaining inventory separately.
3. Call decideCloseout with the goal, nomination and both reports. Honor requested acceptance conditions and limits on staging. Prior success is evidence of what changed.
4. If approved by that decision call stageCloseoutEvidence with the exact report before a receipt, then add its result. Return the report.
