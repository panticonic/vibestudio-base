---
description: Review scoped PDF extraction, offline dictation, and Git Bridge import evidence.
args:
  request: MediaImportRequest
returns: MediaImportReport
budget: { maxTurns: 28 }
---
1. Follow request.checks in order. Call reviewPdf for each pdf check, reviewSpeech for speech or reviewGitImport for git. Give the appropriate original assignment.
2. Return the original findings in that order with their receipt identities and verbatim transcript when the child establishes one. A missing assignment produces the child's missing-evidence report.
