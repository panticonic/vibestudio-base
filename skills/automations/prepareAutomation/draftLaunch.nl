---
description: Derive a launch declaration with the actual executor, trigger, continuity choice, and declared operations.
uses: [chooseExecutor, readSchedule, schedule]
args:
  request: AutomationRequest
returns: LaunchDraft | AutomationHold
---
1. Obtain executor from chooseExecutor(request.goal) and reading from readSchedule(request.goal). Convert the reading via schedule.toTrigger using request.timezone and request.now. If conversion refuses the reading, return hold with the actual constraint.
2. Use chooseConversation(request.goal, trigger). Return hold if the caller needs to choose continuity before launch.
3. Call declareOperations with the goal, assigned operation catalog, and selected executor. Keep exact service and method names, and preserve action versus conditional use.
4. Review with reviewLaunch. Return the actual launch plan only when the proposal fits the request and every predictable external operation is either declared or described as unresolved. Return a specific hold if there is an unresolved issue.
