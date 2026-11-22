---
description: Select the newest relevant native record and establish whether its sender and authority join.
args:
  index: WelcomeIndex
  choice: WelcomeChoice
  earlier: WelcomeSnapshot
  current: WelcomeSnapshot
  resolved: WelcomeResolution | null
returns: WelcomeEvidence
---
If choice has no ID, return its reason with null message and sender. Otherwise find the matching resource and call chooseCurrentReceipt with that resource, current snapshot and index.scope.intent. Call reviewWelcomeAuthority with exact scope, resource, chosen row and actual resolution. Preserve the returned evidence. The earlier snapshot helps explain which claim changed. It never supplies current authority.
