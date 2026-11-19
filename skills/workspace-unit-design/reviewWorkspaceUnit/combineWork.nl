---
description: Summarize independent prerequisites in a composed workspace review.
args:
  components: UnitFinding[]
returns: UnitReview
---
Return all components unchanged. Keep each evidence identity only on its first occurrence in component order. Choose the overall decision in this order: a revision-needed component gives revision-needed and finding required-revision; otherwise a waiting component gives waiting and finding pending-lifecycle; otherwise a missing observation or empty list gives not-observed and finding incomplete-evidence; otherwise return ready and finding prerequisites-verified.
