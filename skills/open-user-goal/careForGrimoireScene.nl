---
description: Prepare a public-evidence scene candidate or restrained caretaker handoff for one owned Grimoire.
args:
  goal: string
returns: GrimoireSceneOutcome
budget: { maxTurns: 22 }
---
1. Call findCaretakerDocket with the original goal. Read that docket's readSceneEvidence.
2. Call planCaretakerArtifact with the original goal and the evidence. Call confirmSceneFrontier with the current scene's exact docket ID and frontier before any scratch action.
3. If the frontier changed, call reviseAfterMovement with the prior plan and the gate. Only stage for stage-scene or stage-note, using stageCaretakerArtifact with the original docket and frontier. Never alter Grimoire itself.
4. Call verifySceneHandoff with the exact docket ID and receipt path or null. Return the actual outputs and scope "owned-grimoire-caretaker-draft".
