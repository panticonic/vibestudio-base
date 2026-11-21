---
description: Maintain one owned reusable Natlang skill from retained native evidence.
args:
  goal: string
returns: SkillMaintenanceOutcome
budget: { maxTurns: 18 }
---
1. Call locateMaintenanceSkill with the user's goal. Inspect the matching working edition with inspectMaintenanceEvidence.
2. Pass the exact authoringRequest to authoring.reviewProgram. Call confirmSkillFrontier with the exact card and inspected revision.
3. Give the goal, observation, and gate to decideSkillMaintenance. Only for stage-local-patch call prepareSkillRepair with the original goal and observed source. Preserve its returned receipt. Otherwise keep receipt null.
4. Call checkSkillReadback with the original card in every case. Return its exact result with the observation, installed authoring review, gate, decision and receipt under scope "owned-working-skill".
