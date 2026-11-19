---
description: Review the assigned VibeStudio channel using its live health, diagnostic or conversation evidence.
args:
  request: ChannelReviewRequest
returns: ChannelReview
budget: { maxTurns: 16 }
---
1. For a recap, call reviewConversation with request.operationId and request.goal. Return it with null health and followUp.
2. For health or triage, call reviewHealth with request.operationId. Keep its exact report.
3. For triage, call chooseFollowUp with the goal and health report. If it returns a finding kind, call inspectFinding with the health receipt and that kind. Otherwise leave followUp null.
4. Return health with the observed followUp or null, and null conversation.
