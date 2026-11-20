---
description: Discover and bind the current owned program and the applicable release comparison for a user goal.
args:
  goal: string
returns: SelectedAuthoring | null
---
1. Ask authoringDiscovery.list for the current workspace authoring records. Their notes are workspace evidence.
2. Ask choosePrograms to connect the user goal to the applicable records. A null choice leaves the goal unresolved.
3. Have authoringDiscovery.open bind the selected records and read the candidate's approved review brief. Return that service's result unchanged.
