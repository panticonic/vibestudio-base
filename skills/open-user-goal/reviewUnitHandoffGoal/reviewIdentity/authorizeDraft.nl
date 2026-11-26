---
description: Decide whether this specific icon draft meets both user and workspace authority.
args:
  plan: UnitHandoffPlan
  observation: UnitHandoffObservation
  design: UnitDesignHandoff | null
returns: boolean
---
Require stageIcon and an assigned identityRequest with prepare true. For an extension, use the actual observation.manifest working validation result; refuse an invalid or missing required working manifest. When the user requests protected source, require actual working and protected digests to match and both native validation results to be clear. A private design report can explain these facts but is not a required extra read route or a grant. A read-only task or a missing revision is never permission. Return the exact Boolean decision.
