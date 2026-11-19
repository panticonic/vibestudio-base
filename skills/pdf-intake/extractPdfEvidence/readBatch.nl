---
description: Read a single authorized batch with its selected local extraction mode.
args:
  document: string
  pages: number[]
  mode: ExtractionMode
returns: BatchReceipt
---
Call pdfIntakeRead.read(document, pages, mode) once. Return its actual receipt. The caller decides whether any later batch is usable.
