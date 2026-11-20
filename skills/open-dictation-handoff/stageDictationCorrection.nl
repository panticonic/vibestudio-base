---
description: Write an authorized local review artifact for the current draft revision.
args:
  plan: DictationPlan
  review: DraftReview
returns: 'DictationArtifact | null'
---
Call retainedDictationHandoff.stage with the exact plan and installed review. Return its exact receipt or null.
