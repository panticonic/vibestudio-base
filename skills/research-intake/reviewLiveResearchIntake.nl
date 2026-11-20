---
description: Review the evidence from the exact public sources assigned by the caller.
args:
  request: LiveResearchIntakeRequest
returns: ResearchIntakeReport
uses: [reviewResearchIntake]
---
Call assignedResearchIntake.read with request.operationId. Pass the exact returned receipts to reviewResearchIntake. Return its report unchanged.
