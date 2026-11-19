---
description: Preserve dictated content and prepare text for caller review.
args:
  capturedText: DictationTranscript
  presentation: DictationRequest["presentation"]
  goal: string
returns: DictationDraft
---
Call checkTranscript with the exact transcript. If there is silence return status silence and null text. Otherwise call formatDraft with capturedText, presentation and goal and return its text with status draft.
