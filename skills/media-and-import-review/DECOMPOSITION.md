# Media and import review

This workflow assesses caller-owned PDF, dictation, and Git Bridge readbacks. The root dispatches the requested checks to the matching child. Children explain the observed boundary and identify the original receipts.

| Extension boundary | Native stages | Exact evidence |
| --- | --- | --- |
| PDF ingestion | Inspect document scope, then classify page coverage, layout or OCR evidence. | Canonical `PdfProbeResult` / `PdfIngestResult` digest, page count, selected pages, extraction methods, bounding boxes, confidence and bundled engine availability. |
| Offline dictation | Check artifact generation and input; distinguish completion, progress, silence, cancellation and original error. | The extension's actual `SpeechEvent` union, owned stream terminal event, and documented 16 kHz mono PCM and transport envelope. |
| Git Bridge | Check the identity of the candidate and its snapshot, then assess whether any publication/export conclusion is supported. | The public `GitUpstreamStatusRow` and bridge `ImportResult` projections preserve same-attempt freshness and candidate event/context. Protected main is separately observed. |

Readbacks are data. The review has no authority to use a credential, send a request, start local inference, publish or mutate a workspace.
