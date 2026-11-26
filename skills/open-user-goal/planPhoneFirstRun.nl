---
description: Resolve the user's phone first-run question from owned setup, phase and provider evidence.
args:
  goal: string
returns: PhoneFirstRunFinding
---
Determine what the user needs to establish about this phone's first run or next setup step. Locate the current assigned rehearsal and use readPhoneEvidence(goal, card, null) for a coherent investigation. For refinement, pass the actual previous evidence. The investigation chooses relevant observations; it need not read every subsystem for a narrow question. A similarly named archived or foreign pairing cannot establish current readiness.

Only a non-null setupRequest obtained from the actual current assignment supplies the installed read-only resume capability. Pass that value itself; do not construct an operation ID or setup request from the goal, target name or another receipt. A missing capability means explain the supported next step from the available evidence.

When an existing pairing belongs to this assignment, its installed read-only resume capability can establish the visible workspace's current state. Preserve that pairing; do not issue another invite, install or pair operation. Do not read another owner's readiness. Reconcile startup excerpts, current visible session and setup receipts according to what they actually establish, then return the requested finding and supported next step. A shell marker alone does not prove connection, panel readiness or physical device execution. An unpaired rehearsal cannot be called ready on the basis of a prior marker. Keep actual source-build/release eligibility and the user's restrictions distinct from a recommendation to act.
