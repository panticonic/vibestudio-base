---
description: Resolve the intended brief, time scope, media constraints and local authorization.
args:
  goal: string
  index: ImageIndex
returns: ImagePlan
---
Select the exact owned brief from its title and project. Read whether the user needs the current selection, a comparison, or an explicitly named historical attempt. Only set historicalLabel if the goal names a historical variant exactly. Intersect the formats the brief permits with the user's constraints. Set localHandoff only when the user asks to write a private local note. A request to inspect, describe or publish grants no local write.
