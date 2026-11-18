---
description: Turn a panel repair request into observable behavior and preservation checks.
args:
  request: PanelRequest
  initial: Observation
returns: Checks
---
1. Identify the observable behavior request.goal requires, with the starting state and action that distinguish it from the reported failure.
2. Identify neighboring behavior the repair could change. Use the rendered controls in initial where available. For a request about unsaved changes, distinguish what should happen on navigation, saving, and discarding if the panel supports them.
3. Separate requiredBehavior from preserveBehavior. Express checks as observations of the running panel. Do not choose an implementation or assume the initial behavior passes.
