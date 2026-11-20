---
description: Select one exact assigned object and read its ownership, membership, invitation and approval evidence.
args:
  goal: string
  assignment: ShareAssignment
returns: ShareObservation
---
Use the assignment's exact stable workspace and document identifiers with the user's goal. Call readShare on the matching candidate. The title alone is insufficient.
