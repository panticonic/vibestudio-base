---
description: Judge current authoring inspection and any resulting publication receipt.
args:
  request: TemplatePublicationInput
returns: TemplateDecision
---
When request.receipt exists call confirmRelease with it. A matching receipt with all returned identities establishes published. A different or incomplete receipt needs reconciliation using its operation ID. Without a receipt call confirmInspection, use currentFingerprint as basis and return its result with kind publication.
