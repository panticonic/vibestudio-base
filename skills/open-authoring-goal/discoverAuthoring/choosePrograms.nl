---
description: Resolve the proper candidate program and its applicable released baseline from current workspace evidence.
args:
  goal: string
  sources: AuthoringSource[]
returns: AuthoringChoice
---
Find the candidate matching the user's product, current review, and intended change. Ignore withdrawn records and similarly named unrelated programs. Use a released baseline when the user's goal requires comparison to the last release or the candidate note names a required release. Match the specific release by evidence. When the user requests a current-only review, leave baselineId null. Return kind "hold" with reason "cannot-identify-candidate" if the applicable candidate is missing or ambiguous. Return reason "cannot-identify-approved-release" when the comparison requires an approved release and the records do not identify one. Otherwise return kind "select" and the exact selected IDs.
