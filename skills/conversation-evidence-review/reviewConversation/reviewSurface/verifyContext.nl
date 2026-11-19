---
description: Check that the panel and admitted worker actually use the assigned context and declared capability.
args:
  request: SurfaceInput
returns: string[]
---
Append context when rendered and assigned contexts differ. Append capability when the needed capability is absent from the actual surface. Append agent when the requested agent is not bound. Do not infer any of these from the transcript's prose or appearance. Return in this order.
