# Open PDF goals

The shared root passes the user's request to this installed subtree. The runner
binds local document bytes and independently verifies the final reading or
preservation recommendation.

| Part | Implementation |
| --- | --- |
| Identify the relevant document and pages | Natlang selects the document, pages and evidence steps from owned file names and native probe results. It decides whether to recover text, inspect reading order or render the original. |
| Make a bounded local inspection | The binder checks source revision, page scope and authorized local ports. It builds requests for the installed extraction and layout subtrees. |
| Read text and layout | Existing Natlang call trees choose extraction and order from native PDF.js evidence. Exact helpers rebuild the quotations and fragment coordinates. |
| Read rendered page evidence | The existing PDF.js renderer produces a retained PNG. The binder verifies the PNG identity and computes ink bounds from decoded pixels. |
| Recommend an accessibility action | A Natlang child examines the observed text and geometry alongside the rendered receipts. It recommends preserving row or column relationships, providing equivalent text, or requesting a missing page. |
| Verify the response | The runner reads back the original scratch bytes and retained render independently. It checks exact selected pages, rendered bounds, cited text and reading order against the case's outcome. |
