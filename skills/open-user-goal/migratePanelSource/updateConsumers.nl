---
description: Update only stale working links after the owned panel exists at the intended source.
args:
  observed: MigrationObservation
returns: MigrationReceipt
---
Return panelMigrationChange.update(observed.id, observed.workingRevision, observed.consumerDigest).
