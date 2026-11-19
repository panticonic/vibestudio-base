---
description: Review one Vibestudio extension method against its exact working, published and active state.
args:
  request: ExtensionReleaseRequest
returns: ExtensionReleaseReview
---
1. Call reviewSource with request.operationId and request.method. Call reviewRuntime with the same assignment and method.
2. Call chooseNext with those two reviews. Return both reviews unchanged and its decision. There is no deployment, invocation or approval in this inspection.
