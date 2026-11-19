---
description: Identify the dominant page layout and the evidence for its reading direction.
args:
  page: PdfLayoutPage
  goal: string
returns: PdfLayoutDecision
---
Call describeGeometry using the page. Call classifyLayout with the observed geometry and goal. Return the layout and its justification.
