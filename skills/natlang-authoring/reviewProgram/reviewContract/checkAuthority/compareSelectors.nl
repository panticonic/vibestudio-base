---
description: Compare the selectors for one service, preserving exact callable and call-chain scope.
args:
  service: string
  expected: string[] | null
  candidate: string[] | null
returns: AuthoringFinding[]
---
1. Null means the declared service is unrestricted. An empty list means no callable receives it. A selector ending in /** covers calls along a chain through the named callable. Treat that selector as distinct from the exact callable selector.
2. Compare the expected and candidate selector sets without regard to order or repetition. Return an empty array if both are unrestricted or both lists select the same names with the same suffixes.
3. Otherwise return one service-scope-change finding. Use the exact service name as subject and "unrestricted" for a null candidate. For a candidate list, set observed to the JSON string of its unique selectors sorted in ascending order. In recovery, name the expected restriction and the selectors to restore.
