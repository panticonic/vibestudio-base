---
description: Bind a native content blame range to the exact read state and file identity.
args:
  assignment: SourceAttributionAssignment
  file: SourceAttributionFile
  selected: SourceAttributionSelection
returns: SourceAttributionTrace
---
Return sourceOriginGraph.trace(assignment.id, file.state, selected.candidate, selected.fragment).
