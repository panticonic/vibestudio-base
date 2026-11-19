---
description: Choose the first supported action in the semantic VCS delivery sequence.
args:
  snapshot: VcsDeliverySnapshot
  chain: VcsDeliveryChain
  review: VcsDeliveryChange
returns: VcsDeliveryStep
---
Apply these rules in order.
1. If the snapshot moved, return refresh.
2. If main review says decisions-open, return resolve-integration.
3. If main review says integrate, return integrate-main.
4. If the integration needs an explicit conclusion, return conclude-integration.
5. If the context has uncommitted work, return verify-then-commit. Commit covers the whole local chain.
6. If the clean context is ahead, return verify-then-publish. This means verify before any authorized publication; the assigned file can match main while other committed files differ.
7. Otherwise return already-current.
