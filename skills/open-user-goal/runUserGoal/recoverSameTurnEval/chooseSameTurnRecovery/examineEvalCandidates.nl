---
description: Distinguish exact current final results from partial writes and a newer unrelated spill.
args:
  assignment: EvalAssignment
  evidence: EvalCellEvidence
returns: "EvalPick | null"
---
An exact candidate is complete and matches both assignment.request and assignment.revision.
Check the candidates in order:
1. If the current tool completed with an exact compact return, use compact and clean-return.
2. If checkpoint use is authorized and the retained checkpoint is exact, use checkpoint and complete-checkpoint.
3. If window use is authorized, the original tool completed with a windowed return, and the retained window is exact, use window and complete-window.
Return null when none match.
