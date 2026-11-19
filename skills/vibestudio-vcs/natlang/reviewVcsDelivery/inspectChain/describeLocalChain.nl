---
description: Explain where the uncommitted work sits relative to the assigned file.
args:
  clean: boolean
  fileChanged: boolean
returns: VcsDeliveryLocalChain
---
Return state clean when clean is true and uncommitted when it is false. When uncommitted, explain whether the assigned file differs from its committed version or whether the pending chain concerns other work. A file matching its committed version does not make the context clean.
