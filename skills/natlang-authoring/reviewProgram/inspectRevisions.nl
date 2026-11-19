---
description: Read the candidate and, when assigned, the baseline with the workspace compiler.
args:
  compare: boolean
returns: {candidate: ProgramReadback; baseline: ProgramReadback | null}
---
Call readAssignedProgram for candidate. If compare is true also call it for baseline, even when the candidate is rejected. Return the exact receipts.
