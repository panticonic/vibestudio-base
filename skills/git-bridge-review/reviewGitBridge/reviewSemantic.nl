---
description: Review protected-main export source and pending semantic integration separately.
args:
  semantic: GitBridgeSemantic
  candidate: GitBridgeCandidate | null
returns: GitBridgeSemanticReview
---
Call reviewPublicationBasis with semantic. Call reviewCandidate with candidate. Return their results as source and integration.
