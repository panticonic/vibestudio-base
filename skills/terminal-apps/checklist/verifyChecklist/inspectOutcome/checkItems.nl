---
description: Check the exact checklist state after every observed operation.
args:
  request: ChecklistExecution
  screens: ChecklistScreen[]
returns: boolean
---
Start from the checked items of the first observed screen. After each key, flip exactly that item and compare to the next observed checked list. If continuation was assigned, the final screen must match the state after the last key or the initial observed state when there were no keys.
