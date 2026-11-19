---
description: Verify the assigned operation, immutable artifact generation and recording envelope.
args:
  assignment: SpeechReview
returns: Disposition | null
---
Return wrong-input for an operationId mismatch. Return cancelled for a cancelled stream, integrity-error for a reported corrupt generation, and stream-error for a failed stream in that order. Return preparation-needed for an absent generation or preparing for a generation being prepared. For a prepare assignment use prepared only if the generation is verified and terminal is completed with a ready event; otherwise return preparing. For dictation require mono pcm_f32le at 16000 Hz with inputBytes positive, divisible by 4 and at most 4194304. If any input condition fails return invalid-pcm. Otherwise return null.
