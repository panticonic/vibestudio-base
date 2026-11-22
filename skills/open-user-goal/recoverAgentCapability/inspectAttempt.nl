---
description: Compare the requested step and its earlier evidence without following a similar notebook.
args:
  assignment: ActionAssignment
  goal: string
returns: AttemptPair
---
Select the card for the exact assigned notebook, title and revision. Read it through readNativeAttempt. Select and read the preceding revision of this same step separately. Do not use a similarly titled card from another notebook as either observation. Return them as current and prior.
