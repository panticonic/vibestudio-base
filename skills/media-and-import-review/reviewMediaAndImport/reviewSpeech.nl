---
description: Review the exact offline dictation generation, recording and terminal stream evidence.
args:
  assignment: SpeechReview | null
returns: MediaFinding
---
Start with check speech and transcript null. Return missing-evidence with no evidenceIds when the assignment or evidence is absent. Otherwise cite the one original speech receipt. Call checkPreparation and return its disposition when present; then call interpretDictation. Only for transcript-ready copy the last result event's text verbatim. For integrity-error and stream-error preserve the actual nonempty error in detail verbatim.
