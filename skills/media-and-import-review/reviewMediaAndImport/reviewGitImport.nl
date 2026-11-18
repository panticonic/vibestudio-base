---
description: Distinguish the Git observation, a pending semantic candidate, and an exportable protected-main event.
args:
  assignment: GitReview | null
returns: MediaFinding
---
Use check git and transcript null. When the assignment is absent return missing-evidence with no evidenceIds. Otherwise include status.id and imported.id when supplied, in that order. Call inspectCandidate first. When it returns a disposition use it; otherwise call inspectUpstream. Keep the exact matching candidate or failure detail that determined the report.
