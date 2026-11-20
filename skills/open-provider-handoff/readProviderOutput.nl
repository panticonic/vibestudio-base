---
description: Read original cached data for the selected committed in-scope provider result.
args:
  channelId: string
  resultMessage: string
returns: OutputReadback | null
---
Call retainedProviderOutput.read with the exact observed channel and native message ID. An unavailable result stays unavailable.
