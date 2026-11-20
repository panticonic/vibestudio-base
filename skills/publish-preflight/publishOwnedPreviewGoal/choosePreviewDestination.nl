---
description: Identify the exact target named by the user from the attached launch record.
args:
  goal: string
  observation: OwnedPreviewObservation
returns: 'string | null'
---
Match the user's destination, audience, and environment to exactly one observed row. Return its exact ID even if its approval still needs checking. Return null when no one destination matches.
