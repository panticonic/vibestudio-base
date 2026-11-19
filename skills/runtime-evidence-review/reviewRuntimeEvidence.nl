---
description: Interpret an actual workspace compiler, EvalDO or GAD observation and identify the supported next step.
args:
  request: RuntimeEvidenceRequest
returns: RuntimeEvidenceReport
---
Call reviewProgram for program, reviewEval for eval, or reviewTrace for trace. Return its typed decision. Preserve the original observed identity. This review uses the provided receipt only. It doesn't run user code, switch workspace, or access a more privileged log.
