---
description: Select the exact current provider decision and original result eligible for cached evidence readback.
args:
  goal: string
  card: ConversationCard
  current: ConversationRead
  approval: RetainedApproval
returns: ResultSelection
---
Return a ResultSelection containing the selected decision and result IDs and whether the caller may read that result. This call decides from supplied evidence; the caller performs the readback. Use the latest retained decision that addresses the exact request ID. Compare its provider, operation, audience and revision to the requested scope. A discussion quote, another owner's prompt (compare with card.owner), or panel-drawn approval does not authorize an outcome. Select the most relevant result for that request, preserving any specific mismatch needed in the report. Set read true only if an attributed host grant matches that scope and the selected original result is committed for the same full request with a digest. A denied or superseded decision, preliminary receipt, or a receipt with no digest requires read false.
