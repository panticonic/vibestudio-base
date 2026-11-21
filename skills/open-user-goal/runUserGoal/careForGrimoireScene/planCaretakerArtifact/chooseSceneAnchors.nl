---
description: Select the exact visible or planned anchors needed to meet the user's request.
args:
  goal: string
  evidence: GrimoireSceneEvidence
returns: string[]
---
Resolve named residents or places from current scene.anchors, and include scope.proposed only as planned when the goal asks to record that future item. Use observed positions from the owner view. Do not add unrelated labels. Return each exact anchor id once.
