---
description: Trace content and inspect the direct semantic evidence for the selected fragment.
args:
  assignment: SourceAttributionAssignment
  file: SourceAttributionFile
  selected: SourceAttributionSelection
returns: SourceAttributionEvidence
---
1. Obtain the exact content trace with content.traceOwnedRange(assignment, file, selected).
2. For each span inspect the native work unit if present through intent.inspectOwnedRoot(assignment, span.work). If the span has an imported or snapshot boundary, inspect its command too when that may establish the source. Stop at the recorded external boundary.
3. Keep each returned typed root once by exact ref. Retain the trace even when it has no resolved author.
Return selected, trace and roots.
