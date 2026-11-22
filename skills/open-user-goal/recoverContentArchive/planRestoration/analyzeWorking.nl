---
description: Compare approved file changes with existing coedits and path collisions.
args:
  assignment: ContentArchiveAssignment
  observation: ContentArchiveObservation
returns: ContentArchiveWorkingDiff
---
Return permitted paths with old, missing or mode state in assignment order. Flag collision or coedit only when a path with that state is permitted. A path already current requires no change.
