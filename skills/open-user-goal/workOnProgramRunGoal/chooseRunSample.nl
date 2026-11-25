---
description: Choose the user-authorized initial sample with a current compiler route.
args:
  goal: string
  program: RunProgram
  inspection: RunInspection
  review: ProgramRunReview
returns: string | null
---
Return an authorized initial sample ID for the caller to run, or null when no sample should run. This call selects from the supplied records and does not invoke the program. Keep an inspection-only request at compiler and signature review. Select a sample only when the user wants an actual result, the program permits a trial, the review supports calling this exact exposed callable, and a matching initial sample is authorized in the program's available records. Choose its exact ID. A matching label alone cannot authorize a recovery sample.
