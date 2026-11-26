---
description: Investigate the requested local model, provider and execution evidence with the existing model and witness skills.
args:
  goal: string
returns: LocalWidthInquiry
uses:
  - reviewLocalExecutionWidth/discoverWidth
  - reviewLocalExecutionWidth/readiness/localModelReadiness
  - reviewLocalExecutionWidth/assessExecution
---
Discover the assigned machine, current requirements, selectable providers, server state and retained witness index. Decide which evidence the requested question needs. A provider-context mismatch may already settle a question without inspecting unrelated load tests. Use the mounted readiness skill only when current installed model readiness or alternative selection matters; do not invent a readiness report when it was not acquired. Pass null when it is unnecessary.

Use assessExecution to inspect relevant native witness records and explain the requested conclusion. Current scope and model/provider/lane identity are exact constraints. The best route is determined by the user's needs and the actual evidence, not opaque witness ID order. If the user asks for comparisons, include the relevant comparison; an adequate exact requested model need not trigger every alternative. Return the actual survey, optional readiness and finding. No write is performed by this inquiry.
