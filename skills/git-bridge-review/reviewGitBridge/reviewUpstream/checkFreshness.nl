---
description: Classify the provenance of the current upstream observation.
args:
  upstream: GitBridgeUpstream
returns: GitBridgeFreshness
---
Return observed when the current observation exists. Return absent for local-only or not-materialized. Return in-progress for exporting or pushing. Use failed for an observation failure or any other state with no current observation.
