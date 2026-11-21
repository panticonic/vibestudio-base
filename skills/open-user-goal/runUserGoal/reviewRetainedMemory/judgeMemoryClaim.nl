---
description: Resolve retained workspace claims with source-specific chronology and exact quotes.
budget: { maxTurns: 18 }
args:
  goal: string
  plan: MemoryPlan
  evidence: MemoryEvidence
returns: MemoryOutcome
---
Distinguish actual decisions from draft, quotations, repeated notes, hypothetical instructions and copies about the original. A memory snippet does not prove a claim.
Use confirmed when original discussion and exact committed record support the same requested decision; contradicted when both applicable active sources give incompatible decisions; replaced when original and successor evidence are chronologically explicit; discussion-only or record-only when exactly that source supports it; working-only when the proposed fact exists solely in uncommitted work; ambiguous when the retained sources leave genuinely unresolved alternatives; no-evidence when original eligible records cannot support it.
For every supporting or disambiguating fact attach its exact citation. For an original conversation use layer message, ref envelopeId, coordinate messageId and the exact text. For an immutable source use layer commit, ref eventId, coordinate fileId and exact text. For a draft use layer working with the same file fields. Cite only messages and files that bear directly on the question. A retained deferral, historical quotation or pending placeholder that explains the absence of a decision can itself be cited when it is directly relevant. Order citations by message sequence then by the received committed evidence, then the working draft. Use a concise explanation in plain language. Never invent a receipt from a search hit.
