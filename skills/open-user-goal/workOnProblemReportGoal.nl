---
description: Resolve a reported incident and save a local draft under the user's original scope.
args:
  goal: string
returns: OpenProblemOutcome
---
Call problemIncident.discover to obtain the current incident cards. Call selectIncident with the goal and the cards. If the choice is null, return incident and draft null. Otherwise call problemIncident.open for the chosen card ID. If there is no local save operation for the chosen record, return the chosen incident with draft null. For an authorized operation, call reporter.saveProblemDraft with the unchanged goal and the exact operation ID. Return the chosen incident and the actual draft receipt or hold returned by the installed reporter.
