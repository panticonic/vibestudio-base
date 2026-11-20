---
description: Select the newest exact assignment attempt and its original retained result coordinates.
args:
  scope: SpecialistScope
  handle: string
  snapshot: SpecialistSnapshot
returns: "{ attempt: SpecialistRow | null; result: SpecialistRow | null }"
---
Select the newest attempt for the handle. Keep that explicit record even if the task or context differs so the caller can diagnose wrong scope. If it exists, find the newest result with its same handle and attemptId. Return both exact rows or null. Never fall back to a result from an older attempt.
