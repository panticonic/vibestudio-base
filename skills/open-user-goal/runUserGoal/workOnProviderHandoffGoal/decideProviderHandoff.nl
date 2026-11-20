---
description: Resolve consent, exact receipt and durable retained output before a local handoff.
args:
  goal: string
  card: ConversationCard
  current: ConversationRead
  approval: RetainedApproval
  selection: ResultSelection
  delivery: RetainedDelivery
  output: 'OutputReadback | null'
returns: ProviderPlan
---
Carry the actual channel, frontier, request ID, selected message IDs, and exact output. Use the newest retained decision for this exact request. Hold when scope mismatches (request-mismatch) or host/owner attribution is invalid (attribution-mismatch). A denied decision is denied / decision-denied and an explicit withdrawal is held / decision-withdrawn. A visible pending request with no valid decision is waiting / pending-consent. Partial visibility is waiting / visibility-unconfirmed. A request no longer listed without a recorded decision is held / decision-unconfirmed.

With a matching valid grant, a result bound to a different full request is held / request-mismatch; a missing original result is held / receipt-missing; a provisional result is waiting / receipt-preliminary; failure is held / provider-failed. A committed result with no verified output is held / readback-unavailable. An exact joined approval, delivered original receipt and durable output is ready / verified. Explain the specific boundary. An original grant never authorizes a new send, external session or provider call.
