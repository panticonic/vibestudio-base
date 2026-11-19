---
description: Keep integrity, current activity, and evidence source separate while choosing an exact bounded read.
args:
  request: RuntimeTraceInput
returns: RuntimeEvidenceReport
---
Call chooseTraceRead. Return the exact channel ID and integrity receipt. Count activity as idle when the only apparent work is the caller's own excluded inspection. Otherwise preserve the recorded activity. No model-inferred timestamps can join these records.
