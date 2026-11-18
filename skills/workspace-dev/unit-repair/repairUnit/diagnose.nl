---
description: Locate a workspace unit defect from current compiler and test evidence and inspect the supporting source.
args:
  request: Request
  evidence: Evidence
  priorFindings: Diagnosis[]
returns: Diagnosis
---
1. Separate compiler, authority/dependency, test assertion and infrastructure diagnostics. Preserve the actual diagnostic file/range/compilerCode and immutable test identity where available.
2. Inspect the assigned unit's source inventory at evidence.revision, then read its manifest and the files implicated by the reports through unitRepair.readSource. Follow imported helpers and data flow within the assigned unit. If a dependency outside the owned unit is required, state that exact dependency rather than editing another repository.
3. Call explainCause(request, evidence, source, priorFindings). Return a causal mechanism supported by observed reports and source, the paths to repair, and a distinguishing hypothesis. Repeated evidence with no untried justified hypothesis is a blocker.
