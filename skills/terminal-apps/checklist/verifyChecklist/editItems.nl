---
description: Apply the assigned key presses to the same live checklist in order.
args:
  keys: ItemKey[]
returns: ChecklistScreen[]
---
For each key in the given order, call sendToggle and append the screen it actually returns. Return the collected screens. Each repeated key is a separate toggle.
