---
description: Check actual authority, current handle and effect without repeating a dispatched action.
args:
  request: RuntimeEvalInput
returns: EvalNext
---
If approval is absent return await-approval. If the issued revision is stale return refresh-handle. Observed effect establishes verified. A dispatch with no observed postcondition needs observe-effect. Otherwise return ready.
