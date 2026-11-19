---
description: Save or continue one user-assigned local problem report and verify the actual appended narrative.
args:
  request: SaveProblemRequest
returns: SaveProblemResult
uses: [reviewProblem]
---
1. Call readDraft(request.operationId) and pass its review unchanged to reviewProblem. Preserve the returned defect classification.
2. For prepare-local-draft or keep-local, call composeNarrative with the observed review account and the draft's existing section names, or an empty list for a new draft. Preserve the user's account and distinguish questions from facts. For any other action return held with that action as next and saved null.
3. Use the observed draft for keep-local. For prepare-local-draft, call openDraft with request.operationId to create it once. Pass the exact draft and composed sections to appendDraft.
4. Call confirmDraft with the append receipt. Return saved-local with the exact confirmation and the original defect classification. Set next to keep-local after saving.
