---
description: Choose an order from the live fragment locations and resolve it to exact citations.
args:
  page: PdfLayoutPage
  layout: PdfLayoutDecision
returns: PdfLayoutReading
---
For an uncertain layout return status uncertain and no entries. Otherwise call arrangeFragments with page and layout. Call citeLayout.resolveOrder with the page and locations. Return its exact result.
