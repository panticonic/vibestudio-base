---
description: Check the rebuilt panel slot and ref after a workspace source change.
args:
  evidence: { id: string; slot: string; observedSlot: string; targetRef: string; observedRef: string; beforeBuild: string; observedBuild: string; changedSource: boolean }
returns: UnitReview
---
1. Check that the observed slot and ref match the requested slot and ref. A mismatch returns not-observed and panel-attempt-unbound.
2. Changed source with the same build key returns revision-needed and panel-build-stale. Otherwise the request is ready and finding panel-attempt-verified.
3. Cite evidence.id. A slot may outlive a renderer attempt; the build identity is its own evidence.
