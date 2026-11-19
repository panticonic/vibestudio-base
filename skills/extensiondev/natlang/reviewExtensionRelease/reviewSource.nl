---
description: Determine what the working and protected main manifests establish about the assigned method.
args:
  operationId: string
  method: string
returns: ExtensionSourceReview
---
Call readSource with operationId, then assessSource with its returned observation and method. Return the observation unchanged and that assessment.
