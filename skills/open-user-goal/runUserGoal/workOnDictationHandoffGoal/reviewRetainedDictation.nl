---
description: Apply the installed offline-dictation policy to the exact retained completed text.
args:
  goal: string
  transcript: RetainedTranscript
returns: 'NonNullable<DictationGoalReport["review"]>'
---
1. Call dictation.reviewDictation.prepareDraft with capturedText set to transcript, presentation verbatim, and the unchanged goal. Preserve its speech or silence assessment.
2. Return transcript, verbatim presentation, goal and the exact installed result.
