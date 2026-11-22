---
description: Review how a retained local Tendril instruction would route and preserve scoped evidence only when requested.
args:
  goal: string
returns: TendrilRouteOutcome
budget: { maxTurns: 18 }
---
1. Call identifyTendril(goal), which checks the exact owned board, room, audience and edition. If it holds, return held with its reason and null finding and receipt.
2. Call reviewSlot(goal, board). A held slot means no action: return held with its reason and null finding and receipt.
3. If the board changed, reread the same board with identifyTendril.readBoard. If the user pinned the observed revision, or the current audience no longer matches, return held. If the user permits the current edition and its audience still matches, call reviewSlot again to obtain the fresh projection. If another change occurs, hold.
4. Use the actual projected finding. A local capability match is verified if it meets the goal. Ambiguous registration precedence requires a hold if no unique local action can be identified. Agent fallback requires a hold when the user wants a page-only route, or there is no attached agent and the user needs an agent route. If the user asks for the fallback diagnosis alone, report the finding without sending anything.
5. Keep the exact finding. Only call retainRoute when the user requested private evidence, the board permits it, and the route is verified. If retention returns null, hold for the changed route. Explain current evidence concisely in the reason. Never execute the instruction or send a message.
