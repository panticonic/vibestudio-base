---
description: Propose a complete source repair grounded in observed diagnostics and current file text.
args:
  request: UnitRequest
  evidence: Evidence
  diagnosis: Diagnosis
  source: SourceFile[]
returns: Proposal
---
1. Identify the source changes that remove the diagnosed mechanism while preserving the request's existing contracts. Prefer a complete repair across the affected owned definitions.
2. Return each edit as its real path, the entire current before text and the entire proposed after text. Keep the original exports and production runtime dependencies unless the evidence requires a justified change within caller-owned scope.
3. Explain why these changes predict a different build or test outcome and which existing behavior must remain. When the evidence cannot justify an edit, return no edits and the specific blocker.
