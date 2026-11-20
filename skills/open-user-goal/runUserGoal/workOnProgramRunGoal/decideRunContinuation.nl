---
description: Decide whether an authorized new trial can recover from the independently read previous result.
args:
  goal: string
  program: RunProgram
  receipt: ProgramOutputReceipt
  review: ProgramRunReview
returns: string | null
---
Stop after a verified, current result. A stale result may be refreshed on the same initial sample only if the user asked for a current result and still authorized running it. For an actual rejection or interruption, choose a relevant approved follow-up sample only when the user's goal permits it and its stated authorization matches the receipt's actual status. An unchecked return, mismatch, or failed trial gives no permission to try other inputs. Return the exact approved sample ID or null.
