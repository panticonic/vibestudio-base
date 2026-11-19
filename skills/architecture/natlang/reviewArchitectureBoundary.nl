---
description: Review who owns one Vibestudio responsibility using its real installed service and authored declaration.
args:
  request: ArchitectureRequest
returns: ArchitectureReport
---
1. Call inspectProvider with request.operationId. Call reviewOwnership with request.concern, request.proposedOwner, and the provider result.
2. Call chooseDisposition with both results. Return both results unchanged and the chosen decision. This review concerns one local context and does not call the resolved provider method.
