---
description: Verify the declared admission boundary of a protected continuation.
args:
  evidence: { id: string; parentOpen: boolean; admittedChild: boolean; persistedJob: boolean; continuationMode: "inline" | "new-execution" }
returns: UnitReview
---
For inline continuation require both an open parent and an admitted child. For new-execution require durable persistence first. A matching condition gives ready and finding inline-admission or durable-admission respectively. A failed condition gives revision-needed and finding inline-scope-ended or durable-work-unrecorded respectively. Cite evidence.id.
