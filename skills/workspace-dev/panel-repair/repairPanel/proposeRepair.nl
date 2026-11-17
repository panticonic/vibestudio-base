---
description: Propose exact edits to fix a diagnosed panel behavior.
args:
  request: Request
  diagnosis: Diagnosis
  source: SourceFile[]
returns: Edit[]
---
Identify the smallest source change that fixes the diagnosed mechanism and preserves existing related behavior. Return edits whose before text exactly matches the supplied current source and whose after text is the replacement. Keep the change within the diagnosed panel. If the evidence is insufficient to justify an edit, return an empty list.
