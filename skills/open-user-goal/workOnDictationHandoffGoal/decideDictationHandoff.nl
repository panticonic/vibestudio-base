---
description: Resolve exact draft ownership, conflicts and the user's local action after transcript review.
args:
  goal: string
  thread: DictationThread
  current: DictationSnapshot
  selection: DictationSelection
  review: DictationDraftWitness | null
returns: DictationPlan
---
Return a DictationPlan from the supplied evidence. The caller stages an eligible local correction or alternative; this call decides the plan without changing a draft or writing an artifact. Preserve the actual selection, owned thread and draft IDs and current frontier. Explain which evidence supports the outcome. With unusable text or silence, hold with the existing reason. Report verified text read-only when no local action is authorized.

When a correction is requested, check the latest owned draft evidence in current. If it is closed hold with draft-closed. If its revision differs from the caller's baseline, hold with revision-conflict unless the caller explicitly authorized a separate local alternative. Choose stage-correction only for the editable baseline. Choose stage-alternative only when the caller allows that separate proposal. Do not issue sends, modify the draft, or turn a provisional segment into text.
