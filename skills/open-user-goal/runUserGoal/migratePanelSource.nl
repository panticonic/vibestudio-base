---
description: Reconcile a partially moved installed panel with its approved source and exact local consumer links.
args:
  goal: string
returns: PanelSourceMigrationOutcome
budget: { maxTurns: 24 }
---
1. Call discoverMigration. Call inspectMigration with the actual assignment to read repository identity, current location, panel metadata, and the assigned consumer guide.
2. Call planMigration with the assignment and observation. For move-source or move-and-update call moveSource with the actual observed revision. If it reports state-changed or not-authorized, stop with its current observation. Preserve the exact move receipt.
3. If a move succeeded, or the plan is align-build or align-and-update, call alignBuildIdentity with the latest actual observation. If alignment fails, stop with the actual receipt.
4. For update-consumers, move-and-update or align-and-update, call updateConsumers only after the source exists with current build identity. Pass the latest actual observation. No retry after a concurrent edit.
5. Return the actual assignment, initial observation, finding, move, identity and consumer receipts or null, and the latest observation. Preserve historical and foreign links, coedits, and protected history. The review confirms source and caller compatibility and does not open or publish the panel.
