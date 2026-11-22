---
description: Establish the current manifest and lifecycle evidence for the selected unit.
args:
  goal: string
  plan: UnitHandoffPlan
  observation: UnitHandoffObservation
returns: UnitDesignHandoff
---
1. For an extension with a designRequest, call installed.reviewWorkspaceUnit with that exact request. Keep its report and evidence IDs. Compare the returned working and protected manifest digests, activation events, dependency mode, entry and icon from observation.manifest. A parse failure has no configuration fields to compare. For other unit kinds report that extension design does not apply.
2. Independently report the lifecycle conclusion requested. With inspectLifecycle, call unitHandoff.lifecycle for the chosen path, and use reconcileLifecycle with the actual result and manifest findings. Without that request, leave lifecycle null.
3. A manifest review finds invalid, missing, valid local-only or matching protected source. Derive that from the actual working, published and publication findings. A valid local source is reviewable without a claim that it has deployed. Preserve missing or invalid evidence.
