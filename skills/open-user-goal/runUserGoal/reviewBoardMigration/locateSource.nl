---
description: Bind a user's migration request to a specific owned rendered board and edition.
args:
  goal: string
returns: MigrationView | null
---
1. Use boardMigration.listSources to see the available board titles, editions and identities.
2. Select the exact source requested. Names alone do not authorize choosing an older edition or a different owner's same-name board. Return null when the source remains ambiguous.
3. Call boardMigration.inspect for the selected source ID. Return the exact rendered result.
