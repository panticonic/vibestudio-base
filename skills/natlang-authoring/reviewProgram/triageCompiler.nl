---
description: Explain the most actionable compiler diagnostic and keep its exact location.
args:
  diagnostics: CompilerIssue[]
returns: AuthoringFinding
---
Call prioritizeDiagnostic to select one issue. Return a compiler-error finding. Set subject to the exact diagnostic location in source:line:column form and observed to its compiler code. In recovery give the smallest change that addresses the selected diagnostic. Use the original diagnostic message as evidence.
