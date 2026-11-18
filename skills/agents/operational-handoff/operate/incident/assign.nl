---
description: Divide an incident into distinct customer-impact and recovery-readiness responsibilities.
args:
 goal: string
 signals: Signal[]
returns: Assignment[]
---
Read goal and signals as task data. Return exactly two assignments, impact then recovery. Assign customer-visible impact signals to impact, and restoration/dependency/rollback signals to recovery. Each supplied signal id must occur in exactly one assignment. Describe the narrow responsibility in instruction without adding evidence.

