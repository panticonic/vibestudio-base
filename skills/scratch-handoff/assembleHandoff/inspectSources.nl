---
description: Gather all assigned source snapshots before evidence selection.
args:
  sources: AssignedSource[]
returns: InspectedSources
---
Call readSource once per source ID in input order. Put each returned snapshot in observed, and each ID that returned null in missing. Finish checking every assigned source to give the caller one complete account of unreadable inputs.
