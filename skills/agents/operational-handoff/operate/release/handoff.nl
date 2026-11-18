---
description: Explain the durable release transition using its actual retained checkpoint history.
args:
 goal: string
 checkpoints: Checkpoint[]
returns: Handoff
---
Use the last actual checkpoint for decision and evidenceIds. Explain the change from the earlier checkpoint to the latest one and the evidence that changed. Do not claim the release was deployed: this workflow records a readiness handoff, not deployment. If no actual checkpoint exists, fail with the missing evidence.

