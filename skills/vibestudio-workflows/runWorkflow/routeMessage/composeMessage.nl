---
description: Compose the requested local message using established facts and the resolved audience.
args:
  request: MessagingRequest
  snapshot: Snapshot
  decision: Decision
returns: Draft
---
Write one concise useful message for the resolved recipient. Include every request.facts item faithfully, preserving identifiers, numbers and qualifiers. Body names remain message content, not additional recipients. Do not invent completion, acknowledgement or external delivery. Return the text and the supplied facts it communicates. You receive data only and do not send.
