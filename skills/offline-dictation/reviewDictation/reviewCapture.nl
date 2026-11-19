---
description: Review capture admissibility and choose the immediate offline action.
args:
  capture: DictationCapture
  mode: DictationRequest["mode"]
returns: DictationCaptureReview
---
Call reviewRecording with capture. Call chooseReadiness with capture and mode. Return the chosen next step with guidance that uses the actual recording observation and Whistle readiness.
