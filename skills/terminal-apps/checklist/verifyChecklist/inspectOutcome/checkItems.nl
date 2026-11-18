---
description: Check the exact checklist state after every observed operation.
args:
  request: ChecklistRequest
  screens: ChecklistScreen[]
returns: boolean
---
The initial checklist is empty. After each key, flip exactly that item and compare to the observed checked list. If continuation was assigned, the final screen must match the state after the last key or the empty initial state when there were no keys.
