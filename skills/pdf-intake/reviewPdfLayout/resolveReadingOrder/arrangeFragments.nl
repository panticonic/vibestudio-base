---
description: Return fragment locations in the chosen reading order.
args:
  page: PdfLayoutPage
  layout: PdfLayoutDecision
returns: PdfFragmentLocation[]
---
Return one entry per fragment using its row and fragment indexes. For a table return all cells of a row from left to right before the next row. For columns read the full left column top to bottom before the next one, with any full-width common heading first. For a sequence read top to bottom then left to right within each row. Use every observed fragment exactly once.
