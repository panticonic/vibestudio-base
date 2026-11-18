---
description: Coordinate separate impact and recovery workers and synthesize their reread durable assessments.
args:
 goal: string
 signals: Signal[]
returns: '{ handoff: Handoff; handles: OwnedHandle[] }'
---
1. Call assign(goal, signals) to split the incident evidence into the impact and recovery responsibilities. Keep both assignments; each must reference only supplied signal ids.
2. Open one ownedOperations worker for impact and one for recovery. These are distinct actual handles. For each assignment, call assess(goal, signals, assignment), then append the resulting Assessment to its matching worker at expectedRevision 0. The two assessments and appends are independent and may run together.
3. Read both handles with ownedOperations.read after their writes settle. Keep the persisted assessment at revision 1 for each role; do not substitute the local planned assessment for a missing stored result.
4. Call synthesize(goal, persisted impact assessment, persisted recovery assessment). Return its Handoff and both exact handles. The parent owns cleanup after this stage completes.

