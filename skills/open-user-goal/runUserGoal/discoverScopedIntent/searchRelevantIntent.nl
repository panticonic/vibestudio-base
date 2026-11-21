---
description: Discover the exact installed native operations that could answer an underspecified user request.
args:
  goal: string
  notice: IntentNotice
returns: IntentSearch
---
Identify the different questions inside the user goal and search with short technical nouns or method names for those needs. The likely vocabulary includes working state or vcs status, retained bytes or fs readBytes, installed skill or workspace readSkill, and live instances or runtime listEntities. These are candidates only. For each useful search call workspace.searchIntentCatalog, then describe only hits that could answer the request with workspace.describeIntentCapability. Return actual queries, their original hit arrays, and exact useful descriptions. Omit actions not needed for this question.
