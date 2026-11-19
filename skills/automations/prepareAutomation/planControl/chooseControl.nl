---
description: Translate the user's requested lifecycle action using the observed state.
args:
  goal: string
  state: MissionState
returns: ControlChoice | "hold"
---
Stop, disable, pause and turn off mean reversible pause. Delete, permanently remove or retire mean retire. A paused automation can be resumed when asked, and an active automation can be manually run when asked. When the requested action is incompatible with observed state, or would require guessing the user's intent, return hold.
