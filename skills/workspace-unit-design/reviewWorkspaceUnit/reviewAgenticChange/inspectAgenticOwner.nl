---
description: Match changed behavior with the unit that owns the agentic contract.
args:
  evidence: { id: string; subject: AgenticSubject; candidateOwner: string }
returns: UnitReview
---
Use panels/chat for product composition, packages/agentic-chat for reusable UI, workers/agent-worker for default tools, packages/agentic-do for native sessions, packages/agentic-protocol for protocol reducers, workers/pubsub-channel for durable channel logs and packages/agentic-core for client coordination. Compare the candidate owner. A match gives ready with agentic-owner-confirmed. A mismatch gives revision-needed and finding owner- followed by the exact owning source. Cite evidence.id.
