---
description: Track an observed transcript to a successful terminal SpeechEvent.
args:
  assignment: SpeechReview
returns: Disposition
---
Return stream-open until terminal is completed. A completed stream needs a result event; a progress or ready event alone is missing-transcript. Use silence when the last result text is empty or whitespace-only. Otherwise return transcript-ready. Progress messages are not transcript text.
