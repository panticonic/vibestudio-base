# Retained offline dictation and owned draft handoff

The installed offline-dictation entry checks recording and worker readiness before
it accepts any new audio. Its completed-transcript branch reviews speech versus
silence and formats a reviewable draft. This family starts after capture, with
bounded synthetic operation, device, acknowledgement and segment receipts in
native owned conversations. It mounts the installed prepareDraft, checkTranscript
and formatDraft callables. The existing recording, readiness and transcription
tests retain their separate purpose and case identities.

| Procedure | Implementation |
| --- | --- |
| Discover current work | Call an exact owned conversation index and choose the room and capture from the user's goal. Lookalike rooms are independent owned records. |
| Inspect retained evidence | Use native bounded PubSub readback on two successive frontiers. A capture, segment, acknowledgement and draft revision have separate identities. Reuse HeadlessRunner's owned conversation adapters. |
| Explain the recovery boundary | Typed natural-language stage chooses current capture, verifies operation/device/language, drops duplicate or provisional evidence when the user allows a retained prefix, and decides whether local action is possible. |
| Review dictated content | Mount the real installed offline-dictation prepareDraft child with exact retained Whistle text and language when usable. Leave uncertain wording and another operator's draft alone. |
| Resolve draft conflict and handoff | Reason over intended draft and previous/current revision. Stage only a scoped local correction or suggested alternative with explicit permission. Never send a chat message or modify the underlying draft. |
| Independently verify | Re-read exact native receipts, current draft revision, ordered selected messages, scratch artifact bytes, and unchanged workspace history. Host takes plain review witnesses validated against native proof and compares complete trajectory references. |

The real speech worker, microphone state, audio bytes, and external speech input
stay outside this family's reference fixtures. This is retained text recovery
after a recording, including cases where a transcript cannot be justified.
