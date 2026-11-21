---
description: Render only the exact authorized presentation from the current owned record.
args:
  recordId: string
  revision: string
  prepared: AudiencePrepared
returns: AudienceReceipt | null
---
Return the actual result of nativeAudienceResponse.render(recordId, revision, prepared).
