---
description: Decide whether the user needs an editable scene, a private note, or a hold.
args:
  goal: string
  evidence: GrimoireSceneEvidence
returns: GrimoirePlan
budget: { maxTurns: 12 }
---
1. First match the scope owner and frontier against the installed public scene. Foreign owner means hold-foreign, and stale source means hold-stale. Keep only an exact scope. If the proposed art is required and absent from scene.assets, hold-no-art. If authority is missing for what the user requested, hold-authority. Use keep-current when the goal asks for an explanation without an artifact. For all of these return no proposedIds and a null description.
2. Call chooseSceneAnchors for a permitted artifact. An interaction or accessibility request that needs the working visual artifact should stage-scene. Call writeSceneDescription with the goal, evidence and chosen ids. A one-time caretaker readback uses stage-note with null description. Reference the exact current anchors.
