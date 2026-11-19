---
description: Review whether the immutable website artifact matches the reviewed source and public artifact contract.
args:
  artifact: WebsiteArtifactObservation
returns: PreflightReview
---
Use source-reference if referenceMatches is false. Call checkPublicFiles to explain public safe-surface findings and preserve its blocker IDs. The public file count counts staged output, not deployed files. Return evidence identifying the observed artifact digest and justified blockers.
