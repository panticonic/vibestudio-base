---
description: Decide whether actual extraction results meet the requested text, structure, OCR or image need.
args:
  assignment: PdfReview
returns: Disposition
---
For OCR first check the bundled tesseract-ocr availability; when absent or unavailable return ocr-unavailable. Then check every requested page. For image require imageArtifactId or return missing-artifact. For structure require nonempty line text and positive-area geometry on each requested page, otherwise use missing-layout. For OCR require actual OCR lines on each requested page; return ocr-review for absent OCR lines or an OCR confidence below the caller's minimum or absent when that minimum was requested. For ordinary text require a nonempty embedded or OCR text line per page; missing text requires ocr-review. Use pdf-ready when the requested evidence is present.
