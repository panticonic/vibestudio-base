---
description: Read workspace project sources and decide which facts and authority support this request.
args:
  goal: string
returns: { evidence: ProjectEvidenceReview; decision: ProjectEvidenceDecision }
---
Call readOwnedProjectSources. Give the current observation and original goal to chooseProjectDisposition. Return the exact observation and decision together.
