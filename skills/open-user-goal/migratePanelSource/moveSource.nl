---
description: Move the exact existing semantic repository once.
args:
  observed: MigrationObservation
returns: MigrationReceipt
---
Return panelMigrationChange.move(observed.id, observed.workingRevision).
