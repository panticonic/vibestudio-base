---
description: Interpret the measured recording condition and respect the native engine windows.
args:
  capture: DictationCapture
returns: string
---
Explain the actual condition. For absent request a recording when needed. For too-short suggest recording a longer sample. For too-large explain the 4 MiB transport budget. For invalid-sample ask for a fresh finite, normalized mono capture. For valid report the measured duration and mention multiple local inference windows when windowed is true.
