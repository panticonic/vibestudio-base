---
description: Propose exact edits to fix a diagnosed panel behavior.
args:
  request: PanelRequest
  diagnosis: Diagnosis
  source: SourceFile[]
returns: Edit[]
---
1. Read request.goal, diagnosis.cause, diagnosis.evidence, and the supplied source. Pick the smallest source change that directly addresses the cause and preserves neighboring behavior.
2. From the supplied source, copy the exact complete text of each file you plan to change into before. Produce the complete replacement text in after, using the same path as the source entry.
3. Return the Edit[] to the caller. The caller owns applying the edits and checking the rebuilt panel. When the supplied evidence supports no change, return an empty array.
