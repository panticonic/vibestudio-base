---
description: Read the actual owned channel roster and original exact recipient resolution.
args:
  request: MessagingRequest
returns: Snapshot
---
Call localMessagingRead.inspect(request.recipientPhrase) and return its actual snapshot unchanged. Keep the original canonical resolver's ambiguity as data. This specialist reads only; it never sends.
