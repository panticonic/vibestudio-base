---
description: Check whether the frozen report and exact one-time approval are usable without modifying or broadening either.
args:
  request: ProblemRequest
returns: ProblemNext
---
Call verifyFrozen on the draft's current revision and frozen metadata. If the result needs a fresh freeze return freeze-selected-report. If it says stopped return submission-stopped. If it says ready return ready-to-submit. Otherwise return wait-for-approval. The actual host approval remains the source of authority. Do not describe ready-to-submit as uploaded.
