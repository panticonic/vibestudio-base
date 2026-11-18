---
description: Select specific usable evidence for the caller's research question.
uses: [evidence/checkReadback, evidence/extractSupport]
args:
  request: ResearchIntakeRequest
returns: ResearchFinding
---
1. Call routeCandidates(request). Review the eligible receipts in returned order. When none can be read, distinguish a held fetch from an eligible empty or failed fetch. Use its ID and leave citations empty. When no eligible fetch was attempted, use search-only for an applicable successful discovery row, or no-evidence otherwise. Cite an applicable discovery or failed-search row by ID, if present.
2. For a candidate selected by routeCandidates call checkReadback. When its state is invalid, use readback-invalid, unless another in-scope usable receipt supports the answer. A scoped, usable head can support a claim even if the page is truncated.
3. Call extractSupport(goal, page). When the content supports the requested claim, return disposition supported, evidenceIds containing that source alone, and its citation. Prefer original sources with the requested content. Use more-reading when a usable page is truncated, all received excerpts omit the requested fact, and bytes remain. Otherwise use no-evidence. Cite the relevant checked source ID in either case. Return no quote when the evidence is incomplete.
