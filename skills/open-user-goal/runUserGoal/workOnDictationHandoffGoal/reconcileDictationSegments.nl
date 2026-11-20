---
description: Resolve one retained capture, acknowledgment, exact final segment sequence and current draft.
args:
  goal: string
  thread: DictationThread
  earlier: DictationSnapshot
  current: DictationSnapshot
returns: DictationSelection
---
1. Find the latest capture for this thread and target. Use exact owner and draftId. If the latest receipt gives a different owner or draft, return wrong-scope. If it was abandoned, return capture-abandoned. If the device does not match the assigned device, return wrong-device. If the observed language differs from the assigned language, return language-conflict.
2. For the chosen capture, keep the latest acknowledgment and exact durable final segments. An acknowledgment for a different draft is wrong-scope. A missing or interrupted acknowledgment does not validate any ordinals. Return unconfirmed unless there is a later exact confirmed receipt.
3. Match confirmed ordinals starting at one, using only this capture, assigned language and assigned device. Ignore previews, and deduplicate repeats with the same stable segment ID, text and ordinal by keeping the earliest native message. Conflicting final values for one ordinal are segment-conflict. An accepted ordinal with no final retained segment is missing-continuation. Device or language differs only if the retained selected finals differ.
4. If the capture is interrupted or has unfinished later material beyond a confirmed prefix, use that prefix only when the caller allows it. Then choose verified-prefix. Otherwise hold with missing-continuation. For a finished complete set choose verified. Join selected text in ordinal order with a single space, preserving each segment's wording. The text and retained language form a Whistle transcript. If the selected text is all whitespace choose silence and preserve the exact assembled text for review.
5. Return the chosen capture, selected message IDs, the most recent target draft revision and exact acknowledgment message when present. For unusable text, return no transcript and no selected segments. An unacknowledged draft or sentence from another capture is never replacement evidence.
