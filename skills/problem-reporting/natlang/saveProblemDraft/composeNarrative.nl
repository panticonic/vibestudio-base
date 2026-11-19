---
description: Write reviewable problem-report sections from the assigned account and existing narrative.
args:
  account: Evidence
  existingSections: "string[]"
returns: "LocalDraftSection[]"
---
1. If the report has no symptom section, call writeSymptom with account and include its result.
2. Call writeVerification with account and include its result. Return the authored sections in order. Keep earlier sections intact. No section may cite an uncollected diagnostic.
