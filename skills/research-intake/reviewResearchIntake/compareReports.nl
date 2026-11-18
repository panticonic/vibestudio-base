---
description: Compare two actual source receipts about the same subject, with current facts and dated context separated.
args:
  request: ResearchIntakeRequest
returns: ResearchFinding
---
1. Call selectPair(request). If fewer than two relevant comparable receipts are readable, return unresolved, preserve their original order in evidenceIds and leave citations empty.
2. Call assessRelationship(goal, pair). Return its disposition. Use evidenceIds in pair order. Call quotePair(goal, pair) for corroborated, conflicting, or superseded. For an incomparable or unresolved pair, return no citations.
3. Describe the comparison boundary, disagreement, or update and do not average conflicting values.
