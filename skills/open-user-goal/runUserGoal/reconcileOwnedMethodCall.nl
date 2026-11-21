---
description: Select and settle one exact native method invocation within a disposable owned local channel.
args:
  goal: string
returns: LocalMethodOutcome
budget: { maxTurns: 18 }
---
1. Call readMethodLane with the original goal. Pass its card and actual evidence to planMethodExchange.
2. Call dispatchOwnedLocalMethod only for action "request", with the exact card id, basis and chosen method. A previously settled exchange never needs a new dispatch.
3. Call readExactMethodTerminal with the exact card id and basis. Use the new attempt transport, the exact retained transport on recover, or null on a hold. Return real card, evidence, plan, attempt and terminal under scope "owned-local-method-exchange". An error terminal is still evidence of an exchange. Do not equate dispatched with delivered.
