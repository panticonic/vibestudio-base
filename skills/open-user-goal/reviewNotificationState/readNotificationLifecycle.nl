---
description: Discover the exact retained account state and obtain a fresh authorized projection.
args:
  lane: NotificationLane
returns: NotificationLifecycle
budget: { maxTurns: 12 }
---
Obtain the actual original owned projection and the native refresh receipt. Preserve the actual authority, producer receipt and observation disposition. An identical authorized refresh request retrieves the original committed receipt without advancing or producing a notification again; retry it if the prior response was interrupted. Preserve the original snapshot from that execution rather than relabel a later snapshot as the original. Read the returned current lane only while it retains the same exact ID; current is null for a retired or replacement scope. Return the original, refresh and current observations without reconstructing unobserved values.
