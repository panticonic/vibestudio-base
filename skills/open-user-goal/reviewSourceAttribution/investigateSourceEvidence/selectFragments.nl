---
description: Select actual text fragment IDs needed to answer the source attribution question.
args:
  assignment: SourceAttributionAssignment
  files: SourceAttributionFile[]
returns: SourceAttributionSelection[]
---
Select actual text fragment IDs needed to answer the source attribution question. Include relevant fragments from both halves of a comparison. Return each exact candidate and fragment ID from the inspected files; titles, paths and the most recent writer do not establish origin. Remain inside assigned current state.
