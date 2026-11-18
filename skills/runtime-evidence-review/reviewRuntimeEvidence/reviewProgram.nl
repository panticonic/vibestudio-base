---
description: Separate compiler readiness from the outcome of a specific typed call.
args:
  request: RuntimeProgramInput
returns: RuntimeEvidenceReport
---
Call inspectCompiler. Return its next step with the program path if compilation is unfinished. Otherwise call inspectCall; return its next step and use the current call ID as basis if a call exists, otherwise the program path.
