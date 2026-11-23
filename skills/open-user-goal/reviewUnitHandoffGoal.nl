---
description: Review an installed workspace unit's manifest and visual identity for one private handoff, with a local icon draft only when authorized.
args:
  goal: string
returns: UnitHandoffResult
budget: { maxTurns: 26 }
---
1. Call unitHandoff.discover. Pass the exact goal and visible units to chooseUnit. If there is no single match, return an unassigned report with no observations or effects and explain the distinction the user must supply.
2. Call unitHandoff.begin with the selected path. Check that the returned unit is the selected one. Pass the goal, plan, and exact observation to reviewDesign for a requested manifest or joined review.
3. Pass the goal, plan, observation, and design finding to reviewIdentity for a requested identity or joined review. A proposal can be read-only. A joined review cannot draft an icon on a missing or invalid manifest.
4. Call completeHandoff with the goal and every scoped result. Preserve actual receipts and give the user one grounded next step. Runtime lifecycle, protected main, and working draft are separate facts. Do not publish, activate, restart or build a unit in this review.

Return applicationResult of the actual completeHandoff result. Discovery plans and begin observations remain internal; the user receives the real unit path, design/identity findings and disposition.
