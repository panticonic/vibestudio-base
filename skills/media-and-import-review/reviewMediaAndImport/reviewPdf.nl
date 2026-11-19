---
description: Verify exact page coverage and the required PDF extraction evidence.
args:
  assignment: PdfReview | null
returns: MediaFinding
---
Start with check pdf and transcript null. Return missing-evidence with no evidenceIds when the assignment or evidence is absent; otherwise use the original PDF receipt id as the only evidence id. First call verifyPages. If it returns a disposition, use it and explain the exact missing boundary. Otherwise call checkExtraction and use its disposition, naming the affected page or engine if known.
