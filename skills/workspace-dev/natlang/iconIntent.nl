---
description: Decide what a unit's identity icon should show.
args:
  unit: UnitDescription
returns: IconIntent
---
Return the IconIntent for unit, choosing the family by the first rule that fits:
1. brand: the unit directly implements or integrates one of these technologies, and term is that name exactly: claude, git, gmail, gnubash, javascript, react, svelte, typescript.
2. lucide: the unit stands for a generic concept; term is the name of one concrete Lucide object or action that shows it, lowercase words joined by hyphens (messages-square, database, shield-check, file-text, calendar, settings).
3. emoji: the unit is playful or its identity is a mood or occasion that a drawn icon would not say; term is one emoji.
Answer directly; no tools are needed.
