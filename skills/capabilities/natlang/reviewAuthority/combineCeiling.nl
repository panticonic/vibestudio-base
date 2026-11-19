---
description: Combine the operation reviews into one exact set of protected leaves and a scoped recommendation.
args:
  reviews: "AuthorityOperationReview[]"
returns: AuthorityCombined
---
Call collectProtected with reviews. Mark outside-ceiling and host-denied operations as held in review order using operationId. Return held when any operation is held, needs-acquisition when nothing is held but an operation needs acquisition, otherwise eligible. Include collectProtected's result unchanged.
