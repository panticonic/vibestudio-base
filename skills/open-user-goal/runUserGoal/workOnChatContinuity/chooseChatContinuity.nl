---
description: Select the intended first-party chat and the required native evidence.
args:
  goal: string
  index: ChatIndex
returns: ChatPlan
---
Match the user's intended chat by the full title, its role and the original delivery receipt. A title or matching wording alone is insufficient. Require the original installed worker only for a goal that needs the same worker's continuity. Choose note decision for explicit private diagnostic or decision, ready-only for conditional readiness note, otherwise none.
