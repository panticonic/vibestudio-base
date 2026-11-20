---
description: Obtain a canonical reader or archive observation for the joined owned reader.
args:
  channelId: string
  selection: ReaderSelection
returns: ReaderEvidence | null
---
Call newsEvidenceReader.read with the exact channel and requested selection. Preserve the readback.
