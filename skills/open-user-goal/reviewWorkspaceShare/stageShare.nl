---
description: Stage one exact locally authorized access handoff.
args:
  observation: ShareObservation
  decision: ShareDecision
returns: "ShareReceipt | null"
---
Return workspaceShareHandoff.stage(observation, decision).
An identical request may retrieve the original native handoff receipt without writing another artifact; changed observations, decisions, authority or retained bytes are rejected.
