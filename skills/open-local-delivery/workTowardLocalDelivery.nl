---
description: Reconcile or complete an authorized delivery using the current roster and original retained local receipts.
args:
  goal: string
returns: LocalDeliveryReport
---
1. Call localDeliveryCatalog.discover. Call chooseConversations with the user's goal and those conversations. Inspect each selected conversation with inspectConversation. Keep each actual observation.
2. Call reconsider with the goal, catalog and observations. Its result may name one further observation. Inspect that choice and repeat reconsider once if needed. Preserve all observations as evidence.
3. Call decideDelivery with the goal and exact observations. Its decision selects only a missing authorized local follow-up, if any. Call bindReport for the exact evidence in its read-only result.
4. If the decision names a conversation for delivery and its observed roster resolves exactly one owned recipient, call completeDelivery with the goal, observations and that conversation. Use the original delivery readback. If it provides a matching acknowledged receipt, return the bound report with status delivered and the actual receipt. If the exact readback is missing, use unconfirmed and retain the attempt. Never submit a second note for the same uncertain delivery.
5. If no follow-up is authorized or supported, return the bound result without a delivery.
