---
description: Plan from the actual current project observation and recovered source evidence, or explain the precise hold.
args:
  goal: string
  observed: ReconcileView
  prior: ArchiveSnapshot | null
returns: ReconcilePlan
---
Interpret the user's requested intentions using these actual current file contents, the window bound to observed.head, and the full authorized prior snapshot when supplied. The prior's value, setting, revision and digest are source evidence, not a substitute for current native authority. Do not claim that already supplied evidence is missing. If the request cannot be supported, return held with a reason explaining the actual missing condition; do not return an unexplained null or disguise a hold as an empty ready plan.

For a ready plan, preserve fields and peer amendments the user did not authorize changing. Use exact observed before text and only actually offered coordinates/resolutions. When approved intentions require combining local and incoming values, absence of a resolution named composed does not by itself make the task impossible: an authorized exact-head edit can materialize the desired source, after which the current observed resolution can account for that source. A plan's old coordinates are not approval to merge after an edit changes the head. Use actual operationFeedback to distinguish committed acceptance from a changed/held attempt. If the requested state is already present, say so accurately and determine whether any actual native settlement remains; do not invent another change.
