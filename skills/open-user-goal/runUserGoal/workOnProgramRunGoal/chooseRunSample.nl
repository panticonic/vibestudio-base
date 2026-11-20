---
description: Choose the user-authorized initial sample with a current compiler route.
args:
  goal: string
  program: RunProgram
  inspection: RunInspection
  review: ProgramRunReview
returns: string | null
---
Keep an inspection-only request at compiler and signature review. Run a sample only when the user wants an actual result, the program permits a trial, the review supports calling this exact exposed callable, and a matching initial sample is authorized in the program's available records. Choose its exact ID. A matching label alone cannot authorize a recovery sample.
