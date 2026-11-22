---
description: Choose the original PDF quotations that support the requested change.
args:
  goal: string
  pdf: PdfGoalReport
returns: PdfVaultDecision
---
1. Check that the PDF report identifies the source and requested pages and that the text result verifies the requested lines. If a required page is missing or these lines are unverified, hold and say which source or page is missing or uncertain.
2. Give the zero-based indices in the returned citations array for the exact quotes that support the correction. Preserve quote order and include every independently requested fact. The handoff will carry these exact quotations and their document provenance.
