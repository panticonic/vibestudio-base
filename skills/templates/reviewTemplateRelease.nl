---
description: Review the live protected-main template plan and identify the next publication prerequisite.
uses: [reviewTemplate]
args:
  request: TemplateAuthoringRequest
returns: TemplateAuthoringReport
---
1. Call readAuthoringPlan with request.operationId. Preserve the actual plan unchanged as evidence.
2. Call publicationReviewInput with request and plan. Call reviewTemplate with the resulting publication request.
3. Return the actual plan and review. The report is a preparation handoff. It carries no release receipt.
