---
description: Select an approved exact archive without substituting a same-looking edition.
args:
  assignment: ContentArchiveAssignment
  observation: ContentArchiveObservation
returns: ContentArchiveChoice
---
1. The nominated archive must be available with its exact owning repository, reviewed edition, reviewed manifest digest and coherent file facts. Use that ref if it meets each of those checks.
2. Only if the nominated archive is unavailable and the assignment permits a retained copy, consider the earlier archive. Require the same exact repository, edition, manifest digest and coherent file facts.
3. Otherwise set ref to null. Briefly identify the evidence that decided your answer.
