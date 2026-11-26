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
Explain what the actual original sources establish, including agreement, contradictions, explicit replacements, deferred decisions and genuinely unresolved alternatives. Use a concise domain label for the disposition; no label can substitute for the requested explanation or actual evidence.
For every supporting or disambiguating fact attach its exact citation. For an original conversation use layer message, ref envelopeId, coordinate messageId and the exact text. For an immutable source use layer commit, ref eventId, coordinate fileId and exact text. For a draft use layer working with the same file fields. Cite only messages and files that bear directly on the question. A retained deferral, historical quotation or pending placeholder that explains the absence of a decision can itself be cited when it is directly relevant. Arrange citations to make the requested explanation clear; their array order is not authority. Use a concise explanation in plain language. Never invent a receipt from a search hit.
