---
description: Open one exact currently trusted plan in pregranted-only mode.
args:
  profileId: string
  message: string
returns: QuietRequest | null
---
Call quietIntegrationProtocol.open with the chosen profile and exact current owner message. Return its scoped request.
