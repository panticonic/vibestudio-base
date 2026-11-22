---
description: Check whether the stable source and approved placement can support this move.
args:
  assignment: PanelMigrationAssignment
  observed: MigrationObservation
returns: "MigrationDecision | null"
---
A different repository already occupying the destination means hold-collision. A destination outside a browser panel root, missing or parked source, unexpected package identity, or incompatible current panel metadata (an exact former package name at the new source is a repairable pending build-identity step) means hold-layout. Otherwise return null.
