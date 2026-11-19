---
description: Assess one incident role from only its assigned supplied evidence.
args:
 goal: string
 signals: OperationsSignal[]
 assignment: Assignment
returns: Assessment
---
1. Read the signals named by assignment.signalIds. Do not use unassigned evidence as proof for this worker.
2. For impact, blocked means the supplied evidence describes unresolved customer impact; ready means it explicitly establishes no remaining customer impact. For recovery, blocked means restoration or a required dependency is unresolved; ready means supplied evidence establishes recovery readiness.
3. Return assignment.role, its exact signalIds as evidenceIds, the grounded decision, and a concise reason tied to the supplied evidence. Do not treat the request to coordinate as proof that the incident is resolved.

