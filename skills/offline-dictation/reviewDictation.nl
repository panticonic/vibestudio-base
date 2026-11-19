---
description: Review the caller's assigned offline dictation and prepare a reviewable draft from a completed local transcript.
args:
  request: DictationRequest
returns: DictationReport
---
1. Call dictationCaptureRead.inspect with request.operationId. Give the exact capture and request.mode to reviewCapture.
2. When review.next is transcribe, call dictationTranscription.run with request.operationId. Preserve the returned transcript exactly and call prepareDraft with it, request.presentation and request.goal.
3. Return the capture and review. Include the exact transcript and draft when available, or null for both when inspection is the final step.
