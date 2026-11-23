---
description: Assess whether this actual route projection meets the user goal.
args:
  goal: string
  board: TendrilRouteSnapshot
  finding: TendrilRouteFinding
returns: { verified: boolean; retain: boolean; reason: string }
---
Assess whether this actual route projection meets the user goal. A matching local capability can be verified. Ambiguous registration precedence requires a hold when no unique local action can be identified. Agent fallback requires a hold for a page-only route or when an agent route is needed without an attached agent. A fallback diagnosis alone may report the actual finding without sending anything. Request retention only when the user asks for private evidence and the board permits it; never execute an instruction or send a message. Explain the observed evidence briefly.
