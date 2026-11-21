---
description: Relate the retained active build to the exact working and main revisions.
args:
  observation: UnitHandoffObservation
  lifecycle: UnitLifecycleObservation
returns: UnitLifecycleFinding
---
1. Set activity to approval-pending for a pending approval; blocked for an observed error; in-progress for a building status; active only when running with a processId; inactive in other cases. Keep the actual status and metadata.
2. Compare sourceRevision, active version and build key as a triple. An exact working revision must have this unit's current build key and effective version. If the build can only be anchored to the protected-main revision, say so. When neither relation is established, report unrelated or unverified evidence.
3. Keep health distinct from source match. A present bundle or valid manifest alone cannot establish a live running unit. Report the returned observation and the requested limitation.
