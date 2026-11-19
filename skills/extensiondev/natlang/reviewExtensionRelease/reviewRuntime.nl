---
description: Assess the actual approved runtime observation for the assigned method.
args:
  operationId: string
  method: string
returns: ExtensionRuntimeReview
---
Call readRuntime with operationId, then assessRuntime with that observation and method. Return the observation unchanged and its disposition.
