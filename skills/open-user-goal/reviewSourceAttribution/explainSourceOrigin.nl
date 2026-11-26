---
description: Attribute the selected content using source boundaries and actual native rationale.
args:
  goal: string
  files: SourceAttributionFile[]
  evidence: SourceAttributionEvidence[]
returns: SourceAttributionConclusion
---
1. Decide which returned spans answer the question. Give one claim per relevant exact span and carry its fragment and span IDs. Preserve spans separately even when the bytes look alike.
2. An authored span can support native origin. Carry the exact recorded intent only from its own stated or trigger work root. Mechanical evidence can establish lineage without purpose. A copy, move or adoption may change placement without changing where the underlying text first came from.
3. An imported or snapshot boundary supports external origin and whatever native admission records, if any, actually say. It cannot establish an external author or their intention. Put no inferred explanation into intent. Missing evidence is unresolved.
4. Set supported when all aspects of the user's question are answered to the scope the evidence can support, partial when some material aspect is unresolved, or unverifiable when no relevant current spans could be grounded. Cite only the inspected typed roots.
Explain the answer to the actual question in explanation, separating what the evidence establishes from what remains unknown. When the requested file or lineage is unavailable, explain that limit here; an honest unavailable answer can have no claims. A claim's fragment, span and refs remain exact native identities, never a place for prose or a guessed reference. Do not make up a source or infer an external intention to fill a missing claim. Return the explanation together with the structured native claims and disposition.
