---
description: Determine concurrent successful work witnessed at the requested context and tool boundary.
args:
  survey: WidthSurvey
  receipt: WidthReceipt
returns: number | null
---
Use overlap.countOverlap on this receipt with the survey.requirement.minimumContext and survey.requirement.tools. Bind the calculation to this receipt only. Return the exact result. Boundary instants do not overlap when one job finishes as another starts, and duplicate IDs are one job.
