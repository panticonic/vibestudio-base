---
description: Resolve the exact owned mobile fixture and recommend the next safe continuity check.
args:
  goal: string
returns: MobileContinuityOutcome
budget: { maxTurns: 20 }
---
1. Call selectProfile with the original goal. Match the current device, workspace and package record. Use evidence from that one profile.
2. Call auditContinuity on the actual profile ID. Keep its build, cache, transport and route observations exactly as returned.
3. Call decideContinuity with the goal, profile and evidence. Return its action and reason with the actual profile ID. A replay may establish a code or state property. Only actual device checks can establish installation, rendering or hardware readiness.
