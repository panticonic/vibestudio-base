---
description: Diagnose, recover, and confirm the bound panel using actual visible evidence.
args:
  goal: string
  binding: RecoveryBinding
returns: RecoveryReport
uses: [assessObservation]
budget: { maxTurns: 24 }
---
1. Call panelRecovery.inspect and assessObservation with the exact health observation and binding expectation. Retain this initial assessment and current view. If a requested change lacks authorization, stop with held, the same initial and final assessment, and no effects. If already healthy, report healthy. For a read-only goal report the actual observed state.
2. Call selectRecoveryAction with the user goal, binding, current view, current assessment and prior effects. Apply only a selected action using the observed revision. Keep the actual result in effects and inspect and assess again. When an action reports changed, use the new renderer and controls and choose again. Leave a new fault visible in the result. Stop when recovered, a read-back failure prevents confirmation, or there is no remaining authorized remedy.
3. Report the selected surface ID, exact initial and latest assessments, actual ordered effects, a concise reason, and recovered only if the initial condition required attention and the final independent inspection is healthy. Otherwise report the final observed state, or held for an authority refusal.
