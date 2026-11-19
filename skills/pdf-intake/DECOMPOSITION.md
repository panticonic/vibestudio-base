# Extract evidence from an assigned PDF

| Product behavior | Native decision and exact mechanism |
| --- | --- |
| Identify the assigned document, pages and local engine availability | A read stage calls the existing PDF extension's probe on caller-owned bytes. Typed evidence keeps the exact digest, page selection and availability. |
| Choose a bounded extraction plan | A policy stage considers encrypted input, the user’s layout or OCR needs, and bundled engine availability. TypeScript partitions the exact selected pages into batches with the caller's requested size. |
| Read batches and handle interrupted or partial results | A nested stage invokes the extension for one assigned batch. A TypeScript verifier checks each digest and page identity before any extracted text becomes report evidence. |
| Decide whether the evidence supports the requested citation | A specialist reviews the verified page excerpts and proposes matching line identifiers. TypeScript reconstructs each quote directly from the actual extracted line. |
| Choose an outcome from the completed work | The root preserves encrypted and engine blockers, partial coverage, and completed reads with no matching line. |
| PDF engine lifecycle and document storage | The existing PDF ingestion extension owns these operations. No credentials, paths, raw document bytes, or general-purpose extension invocation enter the lambda. |
| Render presentation images and publish documents | These belong to separate operations. This workflow returns verified text and geometry citations. |

The existing PDF review workflow still interprets receipts from previous runs. This workflow obtains the receipts itself through the same extension, and accepts independently checked extraction evidence from one assigned document.

## Reading-order review

The reading-order workflow uses an opt-in PDF.js fragment observation. The
installed extension groups text on the same baseline and supplies the original
boxes for the constituent text fragments. The caller-sealed binding checks the
document digest, page identity, and evidence size. The inspection lambda
separates geometric description from the table, column or sequence decision.
The reading-order lambda asks for fragment locations and reconstructs their
exact text and boxes, checking that the result covers every fragment once.
