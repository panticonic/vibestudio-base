---
description: Render the selected PDF pages independently and retain their image and ink receipts.
args:
  operationId: string
  pages: number[]
returns: PdfGoalRender[]
---
For each requested page in order call pdfGoalVisual.render with the operation ID and exact page number. Return the resulting receipts unchanged.
