---
description: Review one nominated Testkit attempt using the installed session-test hierarchy.
args:
  goal: string
  attempt: CloseoutAttempt
returns: CloseoutEvidence
---
Call session.reviewLiveCleanup with { goal, receipt: attempt.receipt }. Keep its outcome, deferred callback disposition and actual remaining inventory unchanged.
