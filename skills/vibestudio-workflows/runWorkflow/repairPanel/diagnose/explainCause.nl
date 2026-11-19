---
description: Explain the mechanism responsible for the observed panel behavior.
args:
  request: PanelRequest
  observation: Observation
  reproduction: Reproduction
  source: SourceFile[]
  priorFindings: string[]
returns: Diagnosis
---
Trace where the relevant state is initialized, updated, retained or discarded. Connect the observed sequence to the specific source path and operation that would cause it. Rule out earlier failed explanations using the current evidence. If the source does not establish a cause, state the uncertainty and what evidence would settle it.
