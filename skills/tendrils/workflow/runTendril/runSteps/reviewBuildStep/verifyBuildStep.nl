---
description: Join a native update outcome to the observed presentation on the same slot.
args:
  step: TendrilStep
  before: TendrilPage
  result: TendrilBuildResult
returns: TendrilFinding
---
Cite the before page and the new page if present. Hold on a missing page, another slot, regressed revision, or missing previously stored fields and values. For a proven result require result.page.build to equal step.expectedBuild and return verified. For an update that failed, return rolled-back only if the observed build equals the original build. For all other cases return blocked with null page. Include the observed page for verified or rolled-back.
