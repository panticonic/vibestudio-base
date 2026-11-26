---
description: Resolve the requested notice against the operative view and retained evidence.
args:
  goal: string
  lifecycle: NotificationLifecycle
returns: NotificationFinding
budget: { maxTurns: 10 }
---
1. If current is null, return scope-changed with null id and revision. If the named notice is ambiguous in the current lane, return ambiguous with null id and revision.
2. Compare the requested stable notice across original attention, original retained rows, current attention and current retained rows. If the user conditions action on the prior specific content or revision and a replacement is current, return superseded with its stable ID and current revision.
3. For a unique exact current entry in attention, return pending. For an acknowledged entry still visible in retained history, return read. If an originally visible invitation is absent from both while a retained agent message for its exact channel explains suppression, return hidden using the exact original ID and revision. Otherwise return missing. Preserve an actually observed prior ID and revision when describing that removed record; use null when no exact observed identity is established. A prior identity does not authorize acknowledging a nonexistent or replacement record.
