---
description: Reconcile the proposed owner of durable state with the source of truth.
args:
  concern: ArchitectureConcern
  proposedOwner: ArchitectureOwner
  provider: ArchitectureProvider
returns: ArchitectureOwnership
---
Call chooseOwner with concern and provider. Return the owner, the proposed owner unchanged, and whether they are identical.
