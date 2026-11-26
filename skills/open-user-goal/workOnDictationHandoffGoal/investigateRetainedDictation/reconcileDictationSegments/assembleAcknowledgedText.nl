---
description: Assemble confirmed native speech segments in the original order.
args:
  thread: DictationThread
  current: DictationSnapshot
  capture: CaptureReceipt
  acknowledgment: Acknowledgment
returns: AssembledText
---
1. Consider only the exact capture. Match confirmed ordinals starting at one through acknowledgment.throughOrdinal. Ignore preview rows when selecting final text. If an ordinal has no final row, return missing-continuation, null transcript and no segment messages.
2. For each selected ordinal, check the device and language of all its final receipts. Return wrong-device or language-conflict with no segment messages or transcript for a mismatch. Deduplicate repeats based on stable segment ID, text and ordinal by preserving the earliest native message. Different final values for one ordinal mean segment-conflict and no segment messages or transcript.
3. A capture is partial if interrupted or if any later material remains beyond the acknowledged prefix. If the caller disallows a partial result, return missing-continuation with no text. Otherwise use verified-prefix for partial and verified for complete.
4. Join selected text in ordinal order with a single space between segments and keep their native message IDs. Return the exact text and retained language in a Whistle transcript. Use silence when the exact text contains only whitespace.
