---
description: Discover and bind the current owned program and the applicable release comparison for a user goal.
args:
  goal: string
returns: AuthoringDiscoveryOutcome
---
1. Ask authoringDiscovery.list for the current workspace authoring records. Their notes are workspace evidence.
2. Ask choosePrograms to connect the user goal to the applicable records. When the choice says hold, return status "unresolved" with its reason.
3. Have authoringDiscovery.open bind the selected records and read the candidate's approved review brief. Return {status: "selected", value: the bound result} when the service returns one. Return {status: "unresolved", reason: "cannot-bind-scope"} if the selected records could not be bound.
