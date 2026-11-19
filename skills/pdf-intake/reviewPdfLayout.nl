---
description: Recover the reading order of one assigned local PDF page using actual text-fragment geometry.
args:
  request: PdfLayoutRequest
returns: PdfLayoutReport
---
Call pdfLayoutRead.inspect with request.operationId. Call inspectLayout with the page and request.goal. Call resolveReadingOrder with the page and chosen layout. Return the page number, original digest, layout, and cited reading order.
