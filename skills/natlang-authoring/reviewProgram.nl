---
description: Review a candidate Natlang program against its intended contract and optional baseline.
args:
  request: AuthoringRequest
returns: AuthoringReport
budget: { maxTurns: 20 }
---
1. Call inspectRevisions(request.compare). Preserve the exact readback revision of each assigned program. If the candidate is rejected, call triageCompiler on its diagnostics and report candidate-rejected. An unusable baseline with a compiling candidate instead gives baseline-rejected with the baseline compiler finding.
2. Otherwise call reviewContract on the original contract and the compiled receipts. Return changes-required when it finds issues and ready when it finds none. Keep each finding and its actual source or service name.
