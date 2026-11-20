---
description: Decide the next authorized recovery action from the actual current renderer.
args:
  goal: string
  binding: RecoveryBinding
  view: RecoveryView
  assessment: PanelHealthAssessment
  effects: RecoveryEffect[]
returns: RecoveryDecision
---
Choose an exact control visible in the current view when its purpose addresses the observed blocker and the user authorized the change. Choose reload only when the reload authorization is present, the goal permits it, and the actual state indicates a renderer fault or unavailable local view. On a changed revision reconsider the new affordances. Stop once the requested action is verified or the latest state requires separate authority or intervention.
