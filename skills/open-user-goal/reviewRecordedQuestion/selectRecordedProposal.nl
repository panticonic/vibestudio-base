---
description: Select the intended visible local record or explain the evidence gap.
args:
  assignment: RecordedQuestion
  candidates: RecordedCandidate[]
returns: RecordedSelection
---
Select the candidate answering the exact scope in the question. Keep a missing blocker when the local approved record is absent, or ambiguous when several records could answer it without a distinguishing current source. Never infer work beyond the visible local scope. Return its exact reference with blocker null only when sufficiently resolved.
