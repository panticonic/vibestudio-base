---
description: Identify current template migration evidence that can answer the open goal.
args:
  goal: string
  current: MigrationObservation
returns: string[]
---
Return the record IDs for the caller to read, using only exact visible IDs in current. This call selects evidence; the caller owns readback and any subsequent preparation. Compare similarly named candidates whenever the goal questions ownership or whether one has been applied. Select release, dependency, approval, and receipt records that bear on the question. A record title is a lead rather than final authority. Ignore unrelated retained desks.
