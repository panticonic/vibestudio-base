---
description: Extract and cite evidence from the selected pages of one caller-owned local PDF.
args:
  request: PdfIntakeRequest
returns: PdfIntakeReport
uses: [intakeChecks]
---
1. Call probeDocument(request.document) and choosePlan(request, probe). If the plan is encrypted, missing-pages or engine-unavailable, return that status with the probe digest, no read pages or citations, the requested pages as remaining, and the original query as unanswered.
2. Call intakeChecks.batches(request.pages, request.batchSize). For each batch in order, call readBatch(request.document, batch, plan). Keep its receipt only if intakeChecks.matchesBatch(probe.digest, batch, receipt) returns true. If a read throws or the receipt does not match, stop reading. Return incomplete with the verified prefix, remaining requested pages, and citations from that prefix if any.
3. Call findEvidence(request, verifiedPages) to choose relevant line locations and identify unanswered claims. Call intakeChecks.citations(verifiedPages, selection.locations) to reconstruct the quotations and geometry. Preserve the unanswered claims. Report incomplete if coverage is short, even when the verified prefix contains a match. For full page coverage, report no-match if no citation supports the query, partial-match if citations support only part of it, and verified if they answer it completely.
