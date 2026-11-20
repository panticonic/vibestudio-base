---
description: Send the authorized local handoff to the selected current owner and recover its actual receipt.
args:
  goal: string
  task: TaskView
  review: ReviewedAttempts
returns: OwnerDelivery | null
budget: { maxTurns: 10 }
---
1. Select the exact observed lane whose current resolved owner and location satisfy the user request. The task and receipt must still support the handoff. Stop if the authorization or recipient is ambiguous.
2. Form a short body with the exact observed task, current attempt and confirmed artifact facts requested by the user. Call submitNote once with the task, actual lane, and body. Call readNote on that exact attempted send, even when the original response was interrupted. Return the two actual results.
