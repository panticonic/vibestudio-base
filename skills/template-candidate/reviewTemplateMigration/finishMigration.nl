---
description: Reconcile the requested local preparation with its actual native receipt.
args:
  decision: MigrationDecision
  candidate: 'CandidateReport | null'
returns: MigrationDecision
---
Keep the original read-only disposition if no preparation was requested. For requested preparation use candidate-staged only when a native report has a review context on the same observed base and a supported next review step. A missing, stale, changed, unconfirmed or published receipt cannot establish a newly staged review. In that case choose the exact supported hold and clear the handoff recipient when continuity is unconfirmed. Explain the native preparation without claiming a deployment, publication or a passed semantic test.
