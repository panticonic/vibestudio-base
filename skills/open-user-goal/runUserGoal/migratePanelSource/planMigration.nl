---
description: Decide which scoped migration stages remain and whether they are safe.
args:
  assignment: PanelMigrationAssignment
  observed: MigrationObservation
returns: MigrationFinding
budget: { maxTurns: 17 }
---
1. Call assessPlacement. If it returns a hold, use it. Call assessConsumers for currently routed or invalid entries. A working entry with incompatible state arguments or a malformed active link means hold-contract.
2. When the panel is already moved with current build identity and no working entry pointing at the original source, return keep-current.
3. If a move, build identity alignment or consumer repair remains, inspect authority. An inspection-only assignment yields inspect-only. A mismatched destination or old working revision yields hold-scope.
4. For an original source, choose move-and-update if links also need repair, or move-source if they are already correct. Both move plans require aligning the package identity after the move. For an already moved source with pending identity choose align-and-update if links also need repair, or align-build if they are already correct. With an already moved source and current identity, use update-consumers for remaining links. Pinned historical and other-workspace links can keep their previous paths.
5. Briefly explain the exact layout and compatibility basis and what will be preserved.
