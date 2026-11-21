---
description: Join actual read-only assignment, startup and installed provider evidence.
args:
  id: string
returns: { assignment: PhoneFirstRunAssignment; startup: PhonePhaseEvidence; build: PhoneProviderEvidence }
---
Call readSetupAssignment, readStartupPhases, and readBuildProvider with the exact same ID. Return their actual results as assignment, startup and build.
