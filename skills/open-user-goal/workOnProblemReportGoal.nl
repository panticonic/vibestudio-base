---
description: Resolve a reported incident and save a local draft under the user's original scope.
args:
  goal: string
returns: OpenProblemOutcome
---
Call problemIncident.discover to obtain the current incident cards. Call selectIncident with the goal and the cards. If the choice is null, return null. Otherwise call problemIncident.open for the chosen card ID. If there is no local save operation for the chosen record, return null. For an authorized operation, call reporter.saveProblemDraft with the unchanged goal and the exact operation ID. Return the actual draft receipt or hold returned by the installed reporter.

Return the actual installed reporter result directly, or null when no incident can be bound. Keep incident selection in working calls.
