---
description: Check that the selected callable keeps the required inputs and return type.
args:
  contract: AuthoringContract
  candidate: AuthoredFunction[]
  baseline: AuthoredFunction[]
returns: AuthoringFinding[]
---
Match the exact entry source path (a helper elsewhere with the same name is a different function). If missing, return one missing-entry with that path as subject and "missing" as observed. Otherwise compare each specified expected signature field, using the matching baseline entry for fields without expectations when preserveBaseline is true. Keep argument order and optional markers. For a parameter-change set observed to the actual parameters joined by comma and space. For return-change set it to the actual compiler return text. Both use the entry path as subject and recommend the narrow edit.
