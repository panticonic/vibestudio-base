---
description: Select the least new authorized work that obtains the exact part useful to the user.
args:
  assignment: EvalAssignment
  evidence: EvalCellEvidence
returns: EvalPick
---
Call examineEvalCandidates(assignment, evidence).
Return its choice if available.
If it isn't available and assignment.mayNarrow is true, use narrow and bounded-retry.
If the retained checkpoint is for the current request and revision but incomplete, use held and partial-checkpoint.
If there is a nonmatching checkpoint, use held and stale-checkpoint.
If there is a nonmatching or incomplete window, use held and stale-window.
Otherwise use held and no-authorized-result.
