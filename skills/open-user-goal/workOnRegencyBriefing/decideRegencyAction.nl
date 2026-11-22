---
description: Distinguish a valid planning conclusion, an outstanding turn and an authorized committed change.
args:
  goal: string
  plan: RegencyPlan
  current: RegencySnapshot
  forecasts: RegencyForecast[]
  index: RegencyIndex
  findings: RegencyFinding[]
returns: RegencyDecision
---
1. Review the goal's intended consequence and explain the decision using exact facts from the findings and source receipts. If a required horizon is unsupported or a named source is missing, explain the evidence limit. When relevant, account for a retained memo based on an earlier saved receipt. A valid negative finding can still support a requested diagnostic note or read-only answer.
2. A saved balance, month deficit, liabilities, and future projection are distinct. A pending council turn may coexist with already committed economics. Do not start another turn until current.pending is absent.
3. Choose advance only when directly authorized, no pending turn exists, the requested horizon matches the valid projection, and every stated prerequisite holds. A treasury floor is inclusive. Choose stage when the user requests a private note and the facts are sufficient for the requested note, otherwise report or hold according to whether the intended outcome is possible. Never enact a decree, revise a policy or publish.
