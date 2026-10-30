---
description: Say in one sentence what changed in one repository.
args:
  unit: UnitChange
returns: string
---
Write one plain sentence about what changed in the repository unit.unit, from unit.files. Each file has a change:
added, deleted, edited, moved (from the path in from) or mode-changed.
1. Start with the repository name.
2. Say what happened to the files: name at most three of them, then "and N more" for the rest.
3. Use only what unit shows. Do not say why anything changed.
