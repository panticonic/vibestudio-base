---
description: Align only the package name of the moved source at the reviewed revision.
args:
  observed: MigrationObservation
returns: MigrationReceipt
---
Return panelMigrationChange.align(observed.id, observed.workingRevision, observed.manifestDigest).
