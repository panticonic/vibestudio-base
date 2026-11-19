---
description: Route a typed action to the workspace and execution surface that owns it.
args:
  request: RuntimeEvalInput
returns: EvalNext | "eligible"
---
A request to execute in another workspace needs open-target-workspace. A chat-panel cell inspecting another panel needs use-server-eval and the owning service. Shared application state needs use-owned-service. Otherwise the assigned operation is eligible for receipt checks.
