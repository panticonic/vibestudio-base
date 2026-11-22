---
description: Identify stale working links and entries that block a compatible move.
args:
  assignment: PanelMigrationAssignment
  observed: MigrationObservation
returns: '{ stale: string[]; blocked: string[] }'
---
Collect working-route IDs still pointing to the original source into stale. Collect malformed entries and working routes that fail argument compatibility into blocked. Exclude historical refs and other workspace or context links from both.
