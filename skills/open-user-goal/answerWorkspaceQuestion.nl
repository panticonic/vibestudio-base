---
description: Answer a factual question using current workspace documents.
args:
  goal: string
returns: WorkspaceAnswer
budget: { maxTurns: 36 }
---
1. Read the available document names through goalWorkspace.list. Read the relevant current source documents through goalWorkspace.read. Resolve conflicting claims by their dates, explicit approvals and supersession evidence.
2. Return the requested answer with citations containing the actual source path, observed version and a verbatim excerpt supporting each factual claim. Explain any unresolved part of the question using the available evidence. The question authorizes document reads.
