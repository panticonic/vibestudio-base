---
description: Join the latest specialist attempt to its exact original result before claiming usable work.
args:
  scope: SpecialistScope
  choice: SpecialistChoice
  snapshot: SpecialistSnapshot
  membership: RosterState | null
returns: ReceiptJoin
---
For a null handle use choice.reason, with null attemptMessage and resultMessage. For an absent or conflicting agent or missing participant return unavailable-specialist with null IDs. Otherwise call locateOriginalAttempt with scope, handle and snapshot, then use checkResultIdentity with the exact scope and membership participant ID. Return its result unchanged.
