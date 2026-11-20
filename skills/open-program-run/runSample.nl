---
description: Run one observed program revision on the caller-authorized sample.
args:
  programId: string
  revision: string
  sampleId: string
returns: StartedRun | null
---
Return programExecution.run(programId, revision, sampleId).
