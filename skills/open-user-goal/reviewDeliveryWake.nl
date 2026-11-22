---
description: Recover the exact owned mailbox delivery after subscription interruption and wake.
args:
  goal: string
returns: DeliveryWakeReport
budget: { maxTurns: 35 }
---
1. Call discoverDeliveryWake to identify the approved channel, receiver and saved checkpoint.
2. Call inspectDeliveryWake on that assignment. Preserve the actual connection and native mailbox/cursor evidence.
3. Call decideDeliveryWake with assignment and evidence.
4. Only for advance, call applyDeliveryWake with assignment, evidence and choice. Return its actual receipt. Otherwise return a null receipt.
Return assignment, evidence, choice and receipt exactly.
