---
description: Resolve the user's requested installed interface independently of any conflicting review receipt.
args:
  goal: string
  survey: InterfaceSurvey
returns: InterfaceObservation
budget: { maxTurns: 8 }
---
Select the exact installed target by source and role from the user's goal. A review receipt may name a different unit, and does not redefine the goal. Read the chosen ID through inspectInterface and return the exact result.
