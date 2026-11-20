---
description: Plan with the currently visible capability catalog, exact installed knowledge and owned workspace notes.
budget: { maxTurns: 20 }
args:
  goal: string
returns: CapabilityGoalReport
---
1. Call workspace.readPlanningState. Call help.docHelp.keywords on the user's goal to identify focused documentation terms. Call chooseDocRequests with the goal, terms and actual memo. Use exact method spellings from the user's request when they help discover authoritative documentation.
2. Call workspace.collectCapabilityEvidence with the goal and bounded requests. Receive the actual opened catalog descriptions and any live inventory.
3. Call workspace.synthesizeCapabilityPlan with the goal, the actual planning state and those exact entries. It can load the installed skills it needs directly in its own context. Return its actual typed plan.
4. Call shouldStageCapabilityPlan with the goal, authority and plan. If it returns true, call workspace.stageCapabilityPlan with the exact plan. Return the actual plan and its actual scratch receipt or null. Do not execute any planned action.
