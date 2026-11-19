---
description: Check the source digest, encryption and coverage across the requested PDF pages.
args:
  assignment: PdfReview
returns: Disposition | null
---
Require the observed digest to equal the assigned digest or return wrong-input. Return encrypted if the observed PDF is encrypted. Then every requested page must be within pageCount, listed in selectedPages, and present exactly once in pages; otherwise return missing-pages. Return null when all boundaries match. Unrequested pages do not substitute for requested ones.
