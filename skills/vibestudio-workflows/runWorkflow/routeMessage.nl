---
description: Resolve, compose and verify a requested message within a caller-owned synthetic local conversation.
args:
  request: MessagingRequest
returns: MessagingReport
---
Use your callable stages to complete this local messaging task. You have no direct live service capability.

1. Call inspectChannel(request) to obtain the actual current roster and original exact resolver outcome. Call resolveRecipients(request, snapshot). Keep the named recipient separate from names mentioned in the body.
2. If the resolution is ambiguous or absent, call askClarification(request, snapshot, decision). Call inspectDelivery(null), then verifyDelivery(request, decision, null, null, observed). Return held with that clarification only when the observed evidence supports an unsent task. The clarification is a return to the caller, not a conversation send.
3. If one exact recipient is established, call composeMessage(request, snapshot, decision). Preserve the actual supplied facts and user intent. Call deliverMessage(request, snapshot, decision, draft) once and keep its real receipt.
4. Call inspectDelivery(receipt), then verifyDelivery(request, decision, draft, receipt, observed). Return delivered only when the actual committed message matches the selected recipient and composed content. Report the real message id and evidence. If delivery outcome is unknown or failed, return the original blocker; do not substitute another audience or issue a fresh duplicate send.
