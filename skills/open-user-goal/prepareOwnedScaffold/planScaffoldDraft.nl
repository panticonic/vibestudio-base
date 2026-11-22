---
description: Decide which native product starter to use and whether preparation is authorized.
args:
  goal: string
  card: ScaffoldCard
  options: ScaffoldOptions
returns: ScaffoldPlan
---
1. Call chooseScaffoldKinds with the original goal. Keep the exact selected kinds in requested output order.
2. If a requested kind is missing from options.available, choose hold-unavailable. If the goal is asking for an explanation or recommendation only, use advise-only. If the goal asks for a draft and card.permission is read-only, use hold-authority. If the assigned output already exists (per the options available for this brief), use hold-occupied.
3. Otherwise choose prepare. Return the selected kinds and explain the chosen route in one evidence-grounded finding.
