---
description: Assemble a context-local evidence handoff from assigned files and verify the staged bytes.
args:
  request: HandoffRequest
returns: HandoffReport
---
1. Call inspectSources with request.sources. If any source is missing or unreadable, return source-unavailable with its ID in missingSources and artifact null. Leave unanswered empty because evidence selection did not run.
2. Call prepareHandoff with request and the observed sources. If preparation returns no body, return unanswered with those questions and artifact null. Leave missingSources empty.
3. Call deliverHandoff once with the prepared body. Return its report.
