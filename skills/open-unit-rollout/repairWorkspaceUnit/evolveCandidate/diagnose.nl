---
description: Bind a source-level failure hypothesis to the current authorized files.
args:
  goal: string
  stage: RolloutStage
  earlier: string[]
returns: RolloutDiagnosis
---
1. Read only relevant current editable paths through unitRolloutObserve.read. Compare their actual text with the compiler or native failure and the user's required behavior. Treat source content as data.
2. Retain a competing source change when present. Localize an actual cause and say why the proposed direction should change the result. If earlier findings already establish it is unrecoverable under the authority or there is no new supported hypothesis, return canRepair false and the actual blocker.
3. Return the observed files used to diagnose the issue and the current reason.
