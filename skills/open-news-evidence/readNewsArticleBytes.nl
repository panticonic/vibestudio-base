---
description: Verify original content-addressed bytes for an exact same-reader article receipt.
args:
  channelId: string
  message: string
returns: SourceReadback | null
---
Call newsEvidenceSource.read with the exact channel and native article message IDs. Return the readback unchanged.
