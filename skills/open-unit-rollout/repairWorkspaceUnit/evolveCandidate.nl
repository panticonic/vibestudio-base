---
description: Propose one real source repair and independently check its current resulting revision.
args:
  goal: string
  stage: RolloutStage
  earlier: string[]
returns: RolloutStage
uses: [repairWorkspaceUnit/inspectUnit]
---
Investigate one supported repair hypothesis using the goal, actual current stage and relevant earlier findings. Diagnosis and proposal functions can interpret actual source and compiler/check failures. Do not replace a protected policy or alter source for an observation-only request.

Apply only a justified edit to the exact source revision and owned editable paths actually inspected. Interpret the Native result: a changed head or denied operation is not a repair and does not authorize replaying the old proposal. Acquire fresh current evidence before deciding what to try next.

Establish actual build evidence for the resulting revision and obtain Native checks when requested and permitted. The inspection branch can preserve a compiler-only request without inventing a suite result. Return actual observation/check together with the supported diagnosis, using null for an unperformed check. A remaining failure supports a different hypothesis, not verified success.
