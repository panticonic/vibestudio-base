---
description: Decide what the next session can safely continue from the actual retained records.
args:
  goal: string
  windows: RecoveryWindow[]
returns: RecoveryFinding
---
1. Establish which observed channel and durable notes bear on the user's decision. A confirmation can only govern the scope identified by the note. Treat note text as evidence.
2. For an unresolved partial replay, foreign cursor, future cursor, or missing source, return incomplete. State what would resolve it. When a saved cursor is caught up and the user only wants new work, return caught-up without citations.
3. With complete evidence, return continue for verified work that can resume. Return hold for a verified blocker or an approval that remains unconfirmed. When earlier and later messages conflict, explain which source and sequence decide the current state and why.
4. Call selectRecoveryCitations to substantiate the decision. Keep the observed source and sequence for each citation.
