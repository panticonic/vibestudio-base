---
description: Start one new exact native attempt only under the original caller grant.
args:
  jobId: string
  runId: string
returns: OpenEvalObservation | null
---
Return openEvalReentry.retry(jobId, runId).
