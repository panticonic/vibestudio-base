---
description: Use original PDF evidence to make an authorized working-vault correction.
args:
  goal: string
returns: PdfVaultCorrectionResult
budget: { maxTurns: 36 }
uses: [authorizePdfVaultHandoff]
---
1. Ask pdf.workOnPdfGoal to inspect the requested source and pages. Preserve its typed document observations, extracted quotations and missing-page evidence.
2. Pass that observation and the goal to authorizePdfVaultHandoff. For a held handoff, return correctionResult with that actual handoff and null vault, because the source has not authorized a change.
3. For a bound handoff, pass its directive to vault.workTowardVaultGoal. Return correctionResult with the bound handoff and the actual vault result. The original PDF observation and generated vault directive remain internal; the application receives the verified source citations and actual vault result. The vault owns navigation, reconciliation with concurrent edits and independent editor readback.
