---
description: Choose a usable intake step before any transcription call.
args:
  capture: DictationCapture
  mode: DictationRequest["mode"]
returns: DictationReadiness
---
Use supply-recording for absent audio. Use repair-recording for any measured invalid recording. Use prepare-local-worker for valid audio while the worker is unready. Use ready for valid audio from a ready worker in inspect mode. Use transcribe for valid audio from a ready worker in transcribe mode.
