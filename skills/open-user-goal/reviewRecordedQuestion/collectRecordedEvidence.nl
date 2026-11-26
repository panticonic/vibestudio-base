---
description: Establish the requested scope or limiting outcome for an actual selected local proposal.
args:
  goal: string
  assignment: RecordedQuestion
  ref: string
returns: RecordedEvidence
---
Determine which native evidence is needed for this question about the selected proposal. The cohort reader establishes the actual work-unit paths and whether the set is complete. The rejection reader can establish later counteractions, using the exact complete cohort you actually observed as its native authority basis. Do not fabricate that prerequisite or substitute another proposal's cohort.

Acquire the relevant observations and return their actual values. Use null for an observation you did not request; an actually empty counteraction list is different from not reading it. Preserve completeness and actual reference kinds, and let the caller report uncertainty when the native evidence is missing, incomplete or stale. No workspace mutation or repeated historic action is authorized.
