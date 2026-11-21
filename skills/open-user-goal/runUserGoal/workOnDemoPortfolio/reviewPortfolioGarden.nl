---
description: Review every selected Grimoire criterion through the installed garden workflow.
args:
  criteria: GardenCriterion[]
  opening: PortfolioFrame
  current: PortfolioFrame
returns: GardenResult[]
---
In criterion order call reviewer.reviewExample.reviewGarden. For a habitat claim pass {kind: "habitat", check: criterion.check, current: current.garden}. For a transition pass {kind: "transition", check: criterion.check, before: opening.garden, after: current.garden}. Return each exact criterion and its installed result.
