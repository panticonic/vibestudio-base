---
description: Recommend an accessibility or reading action grounded in the actual PDF evidence.
args:
  goal: string
  missingPages: number[]
  text: 'PdfIntakeReport | null'
  layouts: PdfLayoutReport[]
  rendered: PdfGoalRender[]
returns: PdfGoalRecommendation
---
1. If a requested page is absent, recommend recover-missing-pages and identify it. If a rendered page has ink but the requested local text read found no embedded content, recommend provide-text-equivalent and explain the text-layer gap.
2. For a paired table use preserve-table-rows. For independent narrative columns use read-columns-in-order. If one document combines materially different page structures use keep-page-specific-structure and explain each structure. For usable single-flow text use preserve-text.
3. Cite the actual page numbers and observations in the rationale. Use needs-review when the observations cannot support the requested conclusion.
