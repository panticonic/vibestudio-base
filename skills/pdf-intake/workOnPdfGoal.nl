---
description: Inspect a local PDF for a user goal and recommend a grounded reading or accessibility action.
args:
  goal: string
returns: PdfGoalReport
uses: [extractPdfEvidence, reviewPdfLayout]
budget: { maxTurns: 30 }
---
1. Read pdfGoalDocuments.discover. Call choosePdfScope with the user's goal and actual document observations. Bind the chosen document and page scope to the observed revision with pdfGoalDocuments.bind. If the scope cannot be justified or bound, return blocked with the observed reason.
2. Call extractPdfEvidence for the bound text request, if any. Call reviewPdfLayout for each bound layout request, preserving page order and allowing different reading structures within one PDF. For a visual request, call readRenderedPages.
3. Call recommendPdfAction with the actual missing pages, text result, layout and render receipts. Return the selected scope, exact results and recommendation.
