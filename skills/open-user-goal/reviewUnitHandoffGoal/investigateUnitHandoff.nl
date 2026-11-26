---
description: Investigate the actual requested installed unit and relevant manifest or lifecycle evidence.
uses: [reviewUnitHandoffGoal/readInstalledUnits, reviewUnitHandoffGoal/chooseUnit, reviewUnitHandoffGoal/beginUnit, reviewUnitHandoffGoal/reviewDesign]
args:
  goal: string
returns: UnitHandoffInquiry
---
Read the owned installed inventory with readInstalledUnits and use chooseUnit to resolve the actual goal. Preserve the inventory and semantic plan. If no unique eligible unit can be established, keep observation and design null and explain that basis in the plan.

Use beginUnit for actual candidate observations needed to answer the goal. The returned manifest anchors and identity request belong to that native unit. ReviewDesign can investigate installed design and runtime evidence when the question needs it; a manifest digest and a retained running build are different facts. Do not call every available helper or require a runtime inspection for a pure artwork question. Acquire additional fresh observations when they change what can be concluded, without treating a read as a new edit grant. Return the actual inventory, plan, selected observation and any design evidence acquired; keep uninspected evidence null.
