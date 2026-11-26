---
description: Compare the requested step and its earlier evidence without following a similar notebook.
args:
  assignment: ActionAssignment
  goal: string
returns: AttemptPair
---
Select the card for the exact assigned notebook, title and revision. Read it through readNativeAttempt. Read the preceding revision of this same step separately when it contributes to the requested comparison or recovery provenance; otherwise prior stays null. Do not use a similarly titled card from another notebook as either observation. Return them as current and prior.
