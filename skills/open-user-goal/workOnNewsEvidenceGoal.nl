---
description: Review the owned News edition and return its findings and private evidence note.
args:
  goal: string
returns: NewsEvidenceResult
uses: [reviewNewsEvidence]
---
Call reviewNewsEvidence with the unchanged goal. Return result of its exact findings. The reader observations and source bodies remain internal to the review hierarchy.
