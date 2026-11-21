---
description: Review owned retained development evidence.
args:
  assignment: "DevelopmentAssignment"
returns: "DevelopmentPair"
---
Call readDevelopmentRun separately for assignment.requested and assignment.alternate. Return the two untouched observations as requested and alternate. An unavailable run is null.
