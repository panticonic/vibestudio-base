---
description: Choose the exact installed integration profile for the user's public outcome.
args:
  goal: string
  index: IntegrationIndex
returns: SelectionChoice
---
Choose the profile whose purpose, version and public destinations fit the goal. Do not guess when equally matching profiles have no distinguishing scope. Return ambiguous-plan or unavailable-plan with null ID in those cases. For a match preserve the exact profile ID. Choosing a profile does not authorize credential lookup by itself.
