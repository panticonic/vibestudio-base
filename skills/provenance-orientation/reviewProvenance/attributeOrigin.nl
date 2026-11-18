---
description: Attribute the observed bytes and the recorded purpose to the correct VCS evidence.
args:
  request: {kind:"attribution"; goal:string; receipt:AttributionReceipt}
returns: ProvenanceReport
---
Call selectOriginReferences for the original source, decision and action references. Call selectRecordedPurpose for the stated intent or labeled boundary. Return origin exactly as seen and preserve the refs in that order. The actor responsible for importing bytes does not establish who authored them.
