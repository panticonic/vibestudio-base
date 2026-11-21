---
description: Prepare the exact owned project, then write and read back its initial candidate.
args:
  scope: ProjectScopeLease
  documents: {path: string; text: string}[]
returns: PreparedContentSnapshot | null
---
Call contentProjectDraft.prepare(scope.receipt, scope.initialHead). If it returns an owned project, call contentProjectDraft.write(scope.receipt, the returned head, documents). Return the exact readback or null.
