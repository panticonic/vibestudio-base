---
description: Investigate which exact current turn evidence can answer the requested recovery question.
args:
  goal: string
returns: TurnRecoveryInquiry
uses: [recoverSameTurnEval/discoverSameTurnEval, recoverSameTurnEval/inspectSameTurnEval, recoverSameTurnEval/chooseSameTurnRecovery]
---
Investigate the user's requested value against the actual assignment and native attempt. Choose useful native evidence and semantic candidate analysis rather than deriving an answer from a status label. The assignment's current request and revision bound every checkpoint, retained window and compact result. Distinguish a complete result from a preview or partial checkpoint and preserve the actual original attempt. A null uninspected evidence or choice is honest when that information has not been acquired; do not manufacture a typed witness. Return actual observations and any candidate choice so the caller can decide how to continue under its real permissions.
