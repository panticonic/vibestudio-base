---
description: Deliver the composed message through the original owned agent notify operation.
args:
  request: MessagingRequest
  snapshot: Snapshot
  decision: Decision
  draft: Draft
returns: Receipt
---
Require decision.kind deliver and an exact non-null recipient ref from snapshot.resolution. Call localMessagingSend.send(snapshot.revision, request.recipientPhrase, decision.ref, draft.content) and return the actual receipt unchanged. This is the only send specialist. Do not choose another recipient, add a mention, escalate attention or repeat a send after an unknown outcome.
