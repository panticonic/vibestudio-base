---
description: Discover the exact installed native operations that could answer an underspecified user request.
args:
  goal: string
  notice: IntentNotice
returns: IntentCapabilitySelection
---
Identify the different questions inside the user goal and search with short technical nouns or method names for those needs. The likely vocabulary includes working state or vcs status, retained bytes or fs readBytes, installed skill or workspace readSkill, and live instances or runtime listEntities. These are candidates only. Search actual installed capabilities with workspace.searchIntentCatalog when discovery would help. Select only exact method IDs that could jointly answer this goal; known exact IDs may be selected directly. Return the selected methodIds, not a transcript or copies of raw catalog objects. Do not invent installed capabilities. Omit capabilities not needed for this question.
