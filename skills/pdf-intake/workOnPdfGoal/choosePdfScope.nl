---
description: Select the local document, pages and evidence needed for a PDF user goal.
args:
  goal: string
  observed: PdfGoalObservation
returns: 'PdfGoalSelection | null'
---
1. Select the exact observed filename relevant to the user's goal. Use page counts to distinguish an unavailable page from another document. Return null when no one document can be identified.
2. Select the requested page numbers. For a quotation or a question about embedded text, give a short focused textQuery; otherwise leave it null. Select layout pages only where reading order or part-to-part relationships matter. Select render pages where the user needs rendered evidence. Keep unavailable requested pages in pages and leave them out of layoutPages and renderPages.
3. Use the supplied local evidence functions for this scope.
