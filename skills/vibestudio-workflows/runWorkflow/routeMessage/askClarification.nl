---
description: Explain an unresolved recipient and ask a useful local clarification without sending.
args:
  request: MessagingRequest
  snapshot: Snapshot
  decision: Decision
returns: string
---
Explain why the named recipient cannot be chosen from the supplied exact resolver outcome. For several candidates, name their distinguishing actual notes/refs and ask which one the caller means. For no match, state the absence and show the available local candidates. Hold the requested note unsent. Return the clarification directly; no service is available here.
