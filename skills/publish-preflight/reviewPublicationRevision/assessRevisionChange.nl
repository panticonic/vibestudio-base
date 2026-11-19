---
description: Attribute differences in the public inventory to the entry chain and review manifest.
args:
  comparison: PublicationRevisionComparison
returns: PublicationRevisionImpact
---
Build the list of affected paths from added, removed and modified. Each modified path occurs once, and the result is sorted using ordinary lexical comparison. Call checkCriticalPaths with those paths and the original and current entry. Return that exact result.
