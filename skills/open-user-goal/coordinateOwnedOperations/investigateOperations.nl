---
description: Investigate the owned concern using the actual incident or release skill and retain its native evidence for the caller's next decision.
args:
  goal: string
  evidence: OperationsDocketEvidence
  previous: "OperationsInvestigation | null"
returns: OperationsInvestigation
---
Interpret what the user asks in this actual docket. Distinguish authority review from an authorized local exercise. For an incident, customer-visible impact and recovery readiness are separate responsibilities; for a release, the earlier assessment and current signoffs may differ and a genuinely requested restart must use actual durable readback. The private roles module contains the appropriate semantic skills and exact owned-worker operations.

Choose useful investigations from those skills rather than treating every capability as a required route. Preserve accurate previous evidence when refining. When an owned exercise is completed, use completeOperation with the actual kind and role result to retire the issued resources and retain the real cleanup value. Do not invent handles, persisted checkpoints, restart success or cleanup. A Native refusal or missing readback is evidence for the continuation, not a reason to fabricate the earlier result.

Return the actual operation when performed, otherwise null, and the useful operational finding supported by the actual docket and observations. Read-only authority can support an explanation without an exercise. Do not write a dossier here; the caller decides whether the user requested one from this evidence.
