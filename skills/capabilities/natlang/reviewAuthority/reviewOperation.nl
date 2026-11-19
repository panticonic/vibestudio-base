---
description: Compare the live preflight of one operation with the caller's exact allowance.
args:
  operationId: string
  ceiling: "ExactAuthority[]"
returns: AuthorityOperationReview
---
Call preflight with operationId. Pass the resulting leaves and ceiling to findOutside. Pass the observed decision and the outside list to decideDisposition. Return the original observation and both results.
