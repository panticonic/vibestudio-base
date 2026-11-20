---
description: Select the exact current workspace unit named in a user goal.
args:
  goal: string
  units: RolloutUnit[]
returns: string | null
---
Use the unit title, kind and the user's named behavior to resolve one currently available unit. Ignore similarly titled units of another surface or unrelated release. Return null when two visible units match equally or when the unit is absent. The presence of an editing grant does not decide which unit the user meant.
