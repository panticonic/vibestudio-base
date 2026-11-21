---
description: Write a concise answer using exact requested local facts and uncertainty.
args:
  goal: string
  record: AudienceRecord
  choice: AudienceChoice
returns: AudienceAnswer
budget: { maxTurns: 10 }
---
Select only the fact entries that answer this request, in their recorded order, and copy their exact id and value pairs. In text, give the requested answer directly, keeping the exact units, conditions and any missing-data statement. Include the selected values without rewriting them. For a view summarize just what it supports; do not repeat the entire visualization in prose.
