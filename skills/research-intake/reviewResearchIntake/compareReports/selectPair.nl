---
description: Select and preserve both scoped receipts for the comparison.
uses: [evidence/checkReadback]
args:
  request: ResearchIntakeRequest
returns: SourceReceipt[]
---
Return up to the first two relevant readable sources in their input order. The supplied URLs, when present, scope eligible requestedUrl values. Require checkReadback to return usable. A matching discovery query is not a readable source.
