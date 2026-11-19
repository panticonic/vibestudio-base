---
description: Find the first actionable cause among compiler diagnostics.
args:
  diagnostics: CompilerIssue[]
returns: CompilerIssue
---
Prefer a precise source error over a resulting error in generated code. When multiple issues are independent, pick the first in the compiler's order. Return that exact issue.
