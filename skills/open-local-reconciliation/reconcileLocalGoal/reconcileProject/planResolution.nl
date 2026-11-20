---
description: Determine an evidence-grounded merge plan or hold when the user's decision lacks support.
args:
  goal: string
  window: ReviewWindow
  observed: ReconcileView
returns: ReconcilePlan
---
1. Compare each site's baseline, working and incoming values. Preserve unchanged fields and authorized local updates. Reconcile incoming additions and conflicting values on their merits, using the goal and current desk record.
2. Hold for any unsupported requirement or unresolved ownership. Mention the affected decision and the missing evidence. A traceable working revision and offered coordinate are required for each edit or merge.
3. For a compatible plan, keep exact before text and compose the desired complete JSON. Preserve new working values that arrived with a peer change unless the user authorized overriding them. Give each decision an offered resolution and grounded rationale. After the exact desired values are already present, use the native current or composed resolution offered for the still unsettled coordinate.
