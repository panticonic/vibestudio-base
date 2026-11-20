---
description: Propose one real source repair and independently check its current resulting revision.
args:
  goal: string
  stage: RolloutStage
  earlier: string[]
returns: RolloutStage
uses: [repairWorkspaceUnit/inspectUnit]
---
1. Call diagnose with the goal, live stage and earlier findings. If the diagnosis is blocked, return the current stage with the specific cause.
2. Call proposeRepair with the goal and diagnosed exact source. Use applyEdit with the observed revision and proposed edits. When the result changed, call inspectUnit with the goal and same unit id before proposing anything further. Do not submit the old edit at a new revision.
3. On a successful apply, call checkCandidate at the returned revision. Return the actual check with an observation for its revision and build, retaining only the original unit and its editable path list. Include the diagnosis. Failed build or suite is evidence for a different hypothesis on the next invocation.
