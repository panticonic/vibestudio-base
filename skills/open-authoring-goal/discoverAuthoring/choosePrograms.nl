---
description: Resolve the proper candidate program and its applicable released baseline from current workspace evidence.
args:
  goal: string
  sources: AuthoringSource[]
returns: AuthoringSelection | null
---
Find the candidate matching the user's product, current review, and intended change. Ignore withdrawn records and similarly named unrelated programs. Use a released baseline when the user's goal requires comparison to the last release or the candidate note names a required release. Match the specific release by evidence. When the user requests a current-only review, leave baselineId null. Return null when the applicable candidate or necessary release cannot be determined from the records.
