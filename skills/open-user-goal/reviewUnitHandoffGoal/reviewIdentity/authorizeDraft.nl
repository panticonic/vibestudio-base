---
description: Decide whether this specific icon draft meets both user and workspace authority.
args:
  plan: UnitHandoffPlan
  observation: UnitHandoffObservation
  design: UnitDesignHandoff | null
returns: boolean
---
Require stageIcon and an assigned identityRequest with prepare true. When design exists, refuse a draft on an invalid or missing working manifest. When the user requests protected source, require design.manifest to be protected-match. A read-only task or a missing revision is never permission. Return the exact Boolean decision.
