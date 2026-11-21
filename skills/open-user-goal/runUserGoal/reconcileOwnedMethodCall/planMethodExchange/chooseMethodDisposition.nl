---
description: Classify whether the exact owned lane can be used.
args:
  evidence: LocalMethodEvidence
returns: LocalMethodPlan["action"]
---
If evidence.current is false, use hold-moved. If evidence.provider is null, use hold-route. If the exact retained terminal exists, use recover. If permission is absent, use hold-authority. Otherwise use request.
