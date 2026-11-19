---
description: Explain the durable release transition using its actual retained checkpoint history.
args:
 goal: string
 checkpoints: Checkpoint[]
returns: OperationsHandoff
---
1. Read the supplied checkpoints. The caller has already restarted the worker, appended the new assessment and reread this exact persisted history. Use the supplied readback as the evidence for this function.
2. Set latest to the last checkpoint. Copy latest.assessment.decision and latest.assessment.evidenceIds into the Handoff. An empty history means the caller lacks evidence and must receive a failure.
3. Explain what changed from the preceding checkpoint and which recorded gates justify the latest decision. This is a readiness handoff. Leave deployment status outside the report.
