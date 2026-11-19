# Offline dictation workflow

The caller owns the recording. The workflow keeps audio at the bound extension
boundary and works with recording measurements, runtime status, and the
completed transcript.

| Procedure | Implementation |
| --- | --- |
| Check recording admission and Whistle readiness | The binding measures the assigned mono float32 samples and reads the installed extension status. |
| Explain short, malformed and over-budget recordings | `reviewCapture/reviewRecording` uses the measured condition and preserves the published transport limit. |
| Decide whether local transcription can proceed | `reviewCapture/chooseReadiness` combines the caller's requested mode with the live worker state. |
| Stream a completed local result | The binding sends the assigned audio through the existing speech stream. The serialized speech worker checks readiness before any load or download. |
| Review speech versus silence and prepare the requested draft | `prepareDraft/checkTranscript` determines whether there is text to preserve. `prepareDraft/formatDraft` applies only the requested editorial treatment. |
| Deliver the result | Return the unchanged transcript and optional draft. The caller can review and use the draft. |
