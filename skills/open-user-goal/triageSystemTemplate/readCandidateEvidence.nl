---
description: Identify and inspect the actual current file evidence needed for the requested candidate review.
args:
  goal: string
  card: SystemCandidateCard
returns: SystemCandidateEvidence | null
---
Inspect the owned native frontier and determine which of its real coordinates answers this goal. The coordinate interpretation function can help distinguish similarly named files and the designated current candidate. Read actual triplet evidence for a supported selected coordinate and return that frontier and preview together. Do not invent a coordinate, substitute a different file’s bytes or claim that a missing/binary/oversized side was read as text. If the actual frontier cannot identify the requested evidence, return null so the caller can preserve that uncertainty rather than manufacture a comparison.
