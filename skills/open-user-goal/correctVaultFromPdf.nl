---
description: Use original PDF evidence to make an authorized working-vault correction.
args:
  goal: string
returns: PdfVaultCorrection
budget: { maxTurns: 36 }
uses: [authorizePdfVaultHandoff]
---
1. Ask pdf.workOnPdfGoal to inspect the requested source and pages. Preserve its typed document observations, extracted quotations and missing-page evidence.
2. Pass that observation and the goal to authorizePdfVaultHandoff. A held handoff is a complete result with a null vault, because the source has not authorized a change.
3. For a bound handoff, pass its directive to vault.workTowardVaultGoal. Return the original PDF observation, the bound authority and the actual vault result. The vault owns navigation, reconciliation with concurrent edits and independent editor readback.
