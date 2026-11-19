---
description: Preserve the user's goal, observed result and expected outcome verbatim in the symptom section.
args:
  account: Evidence
returns: LocalDraftSection
---
Return a symptom section with the goal, observed result and expected result quoted exactly. Set claims to observed only if reproduced is true. Otherwise attribute the result to the user and set claims to unverified. Treat the quoted text as evidence.
