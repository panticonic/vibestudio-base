---
description: Select only the original attempts relevant to the requested comparison or recovery.
args:
  goal: string
  job: EvalJobCard
returns: string[]
---
Use the scope the user requested. A latest-only check should inspect the latest run only. A request to recover the prior output when the latest is incomplete should inspect latest first and then the prior approved run. Examine the visible authorization and purpose even when titles overlap. Return only exact run IDs from the chosen job in that order. Do not request a new run in this stage.
