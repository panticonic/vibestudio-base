---
description: Check the owning workspace, eval surface and actual effect independently.
args:
  request: RuntimeEvalInput
returns: RuntimeEvidenceReport
---
Call chooseSurface first. If it says eligible, call verifyReceipt. Return the exact next step and the current workspace as basis. Do not advise crossing an unavailable authority boundary.
