---
description: Decide whether the observed board can be retained, compare the existing target, or report why migration must hold.
args:
  goal: string
  view: MigrationView
  basis: MigrationBasis
  selection: MigrationSelection | null
returns: BoardMigrationOutcome
---
1. For inspection, read-only comparison, or estimation, return audit with the exact source and selection, no receipt, and actual findings.
2. For a requested write, return held if the approval is missing, its board, revision or destination differs, the selection includes an unapproved card, or the local target already contains different work. Explain the exact cause.
3. Call boardMigration.retain only with the exact observed board id and revision and the selected scope. A rejection is a hold. Read back the exact admitted receipt; if the target already contained the same cards use existing, otherwise retained.
