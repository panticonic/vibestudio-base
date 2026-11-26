---
description: Join the newest retained capture and acknowledgment to the intended owner, source, and draft.
args:
  thread: DictationThread
  current: DictationSnapshot
returns: CaptureBoundary
---
1. Find the newest capture receipt. Find the latest acknowledgment with its exact captureId, if one exists. Keep its native messageId.
2. If the capture has another owner or draft, or the acknowledgment has another draft, return held with wrong-scope. Return held with capture-abandoned for a cancelled take. Return wrong-device for a different device, or language-conflict for a different language.
3. If the acknowledgment is absent or interrupted, return held with unconfirmed. In any held case, keep the chosen captureId and native acknowledgment messageId, or null for no acknowledgment.
4. Otherwise return usable with the exact capture, acknowledgment, and native acknowledgment message ID.
