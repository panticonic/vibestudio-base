---
description: Read actual requested retained notebook content through the exact inspected action.
args:
  goal: string
  evidence: ActionEvidence
returns: RetainedNotebookValue[] | null
---
Use readOwnedValues with the actual inspected action evidence when the user's question requires the retained output itself. This is a read, not permission for another action. Preserve the exact current attempt, revision, original run and content digests. Select the returned values useful for the requested reconciliation without rewriting their bytes or implying a digest contains the missing text. Distinguish the action's original retained output from scope values observed after an actual later continuation. A null result means the exact inspected read basis is no longer available; explain that limit rather than inventing content. Do not use another notebook, guessed scope key, previous edition or fixture knowledge as a replacement.
