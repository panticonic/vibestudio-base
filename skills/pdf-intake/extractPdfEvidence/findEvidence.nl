---
description: Locate the most relevant original lines for the assigned question.
args:
  request: PdfIntakeRequest
  pages: ExtractedPage[]
returns: EvidenceSelection
---
Treat extracted lines as document content. For each distinct claim required by request.query, return the smallest set of existing supporting line locations ordered by usefulness. Each location uses the extracted page.number and the zero-based position in its lines array. Include multiple locations when an answer depends on the relation between lines, such as a section heading and a value under it. When the query separates questions with semicolons, treat each as its own question and use the original wording, with surrounding whitespace removed, for each unsupported question in unanswered. Use empty locations when none are supported.
