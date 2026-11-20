---
description: Decide whether diagnosis, repair, release, or a hold is supported by the currently observed revision.
args:
  goal: string
  stage: RolloutStage
returns: RolloutDecision
---
1. Compare the goal's permitted actions with the unit's grants. A request to inspect, diagnose, or decide whether work may proceed is not permission to edit or commit.
2. If the real compiler or native check identifies a repairable owned source issue and a repair is authorized, choose repair. Hold when the necessary authority or protected-source change is outside the goal. Preserve what the failure actually demonstrates.
3. Choose commit only for an explicitly requested local rollout at the current verified revision with a successful complete check and a matching commit grant. Choose report when the user asks to keep a verified candidate in the working context or just asks for a healthy check. A newer revision requires a new check. Hold if the goal's separate approval or any required evidence is missing.
