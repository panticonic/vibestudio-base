---
description: Check that an installed unit's proposed manifest requests precisely its receiver-defined capability.
args:
  evidence: { id: string; contract: AuthorityLeaf; requests: ManifestRequest[] }
returns: UnitReview
---
1. Filter requests to the contract capability. When its tier is open, those requests are unnecessary and give revision-needed with finding open-method-requested; an empty filtered list gives ready with finding open-method-no-request.
2. For gated and critical contracts, an empty filtered list gives revision-needed and capability-not-requested. Any request under that capability for another resource gives revision-needed and request-scope-mismatch. Otherwise the exact request is ready with finding request-bound-to-receiver.
3. Cite evidence.id. A correct manifest request still requires the applicable host decision.
