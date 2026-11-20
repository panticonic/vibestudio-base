---
description: Review a Vibestudio conversation delivery, chat handoff, exact-context surface, or canonical agentic protocol change.
uses: [reviewChatDelivery]
args:
  request: ConversationRequest
returns: ConversationReport
---
1. For delivery, surface, or contract, call reviewDelivery, reviewSurface, or reviewContract respectively. Return its assessment.
2. For chat-handoff, call reviewChatDelivery with the assigned goal, operationId, contextId, and panelId. Pass that exact report to chooseChatHandoff. Return kind chat-handoff, the verified or inspected channelId from chat.delivery.observation as basis, the full chat report, and the returned next step. Set ready only for next ready. Use an empty blocker list when ready, otherwise use the single chat verdict as the blocker.
3. Keep every fact bound to the assigned receipt, channel, panel, or revision. Perform no writes or replacement sends.
