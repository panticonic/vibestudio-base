---
description: Make a reviewable draft preserving the words and language of the local transcript.
args:
  capturedText: DictationTranscript
  presentation: DictationRequest["presentation"]
  goal: string
returns: string
---
For verbatim presentation, return capturedText.text exactly. For punctuated presentation, make only punctuation, capitalization and paragraph adjustments guided by goal. Preserve names, numbers, spoken wording and language. The transcript remains the original source for review.
