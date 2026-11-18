---
description: Select an authorized local extraction mode from the original PDF probe.
args:
  request: PdfIntakeRequest
  probe: ProbeReceipt
returns: IntakePlan
uses: [intakeChecks]
---
Encrypted PDFs need a password-capable follow-up. If encrypted, return encrypted. If intakeChecks.completeSelection(request.pages, probe) is false, return missing-pages. If the bundled embedded engine is unavailable, return engine-unavailable.

An explicit OCR request needs both authorization and bundled local OCR. Without either, return engine-unavailable. For authorized OCR when bundled OCR is available, choose local-ocr. Use local-fallback for a layout task only when the request permits OCR and the probe shows the bundled local engine. Otherwise choose embedded. All modes preserve existing line geometry. The fallback only runs OCR on sparse pages.
