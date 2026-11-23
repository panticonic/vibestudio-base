---
description: Trace exact current workspace content to its native decision or external source boundary.
args:
  goal: string
returns: SourceAttributionReport
budget: { maxTurns: 50 }
---
1. Discover the scoped user question and retention authority with discoverSourceAttribution().
2. Use inspectCurrentSource(assignment, candidate.id) for the candidates relevant to the question. Select the actual text fragment IDs; titles, paths and the most recent writer do not establish origin.
3. Use traceSelectedSource for each relevant candidate and fragment. Include evidence for both halves when the question compares them. Stay within the assigned current state.
4. Call explainSourceOrigin(goal, files, evidence). Preserve what each source proves and any limits.
5. If the user authorized a receipt and the conclusion contains useful current evidence, call reviewAttributionHandoff(assignment, files, evidence, conclusion). Return the actual receipt or the reason native authority declined it. Otherwise return null receipt.
Return conclusion and actual receipt. The working observations and authority checks stay in the call tree.
