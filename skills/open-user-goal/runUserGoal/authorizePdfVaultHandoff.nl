---
description: Decide whether the live PDF evidence authorizes a working vault correction and bind its provenance.
args:
  goal: string
  pdf: unknown
returns: PdfVaultHandoff
---
1. Call choosePdfVaultEvidence(goal, pdf). If it holds, return its reason and retain the PDF report at the root.
2. For a proposed correction, call pdfVaultBridge.bind with the unchanged original PDF report and the chosen zero-based citation indices. Return the actual bound handoff. If binding fails, hold.
