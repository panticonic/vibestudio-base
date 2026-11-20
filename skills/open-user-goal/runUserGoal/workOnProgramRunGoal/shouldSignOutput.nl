---
description: Decide whether an independently checked output can warrant the requested signed workspace artifact.
args:
  goal: string
  program: RunProgram
  receipt: ProgramOutputReceipt
  review: ProgramRunReview
returns: boolean
---
Return true only when the user specifically requested a signed workspace result, the program grants verify-and-sign, its current receipt still authorizes a signature, its actual current receipt independently verified the output, and the evidence review says verified. Preserve a returned but unchecked result as evidence without attesting to it.
