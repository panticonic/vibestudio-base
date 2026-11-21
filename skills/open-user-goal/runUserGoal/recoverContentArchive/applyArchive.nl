---
description: Restore exactly the authorized immutable paths in one version-preconditioned local edit.
args:
  assignment: ContentArchiveAssignment
  observation: ContentArchiveObservation
  archive: ContentArchiveChoice
  plan: ContentArchivePlan
returns: ContentArchiveReceipt
---
Return contentArchiveChange.restore(assignment.id, archive.ref, observation.workingRevision, plan.paths).
