---
description: Review the exact opening request, terminal event, product effect and resource joins.
args:
  request: SurfaceInput
returns: string[]
---
Append opening when the original user turn is not retained. Append terminal unless the assistant action completed. Append effect unless the actual result was observed. Append cleanup unless the scoped resources were joined. Return in this order. UI dispatch by itself does not prove the action.
