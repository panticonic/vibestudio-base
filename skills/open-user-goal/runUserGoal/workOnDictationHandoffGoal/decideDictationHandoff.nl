---
description: Resolve exact draft ownership, conflicts and the user's local action after transcript review.
args:
  goal: string
  thread: DictationThread
  current: DictationSnapshot
  selection: DictationSelection
  review: 'DictationGoalReport["review"]'
returns: DictationPlan
---
Preserve the actual selection, owned thread and draft IDs and current frontier. Explain which evidence supports the outcome. With unusable text, hold with the existing reason. Silence has no draft to stage. Report verified text read-only when no local action is authorized.

When a correction is requested, check the latest owned draft. If it is closed hold with draft-closed. If its revision differs from the caller's baseline, hold with revision-conflict unless the caller explicitly authorized a separate local alternative. Stage a correction only for the editable baseline. Stage an alternative only when the caller allows that separate proposal. Do not issue sends, modify the draft, or turn a provisional segment into text.
