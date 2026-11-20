---
description: Run the installed audience, transport and coverage reviewers for the sealed quiet plan.
args:
  request: QuietRequest
returns: "{ request: QuietRequest; result: BoundReport }"
---
Call installed.reviewIntegration with request. Return the exact request and unmodified report. Observe required and optional coverage and exact held IDs. Never turn a denied quiet lookup into a canonical miss or retry it in a prompt-enabled run.
