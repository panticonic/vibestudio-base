---
description: Resolve the current retained authorization and its scope for the requested schedule.
uses: [readSchedule]
args:
  goal: string
  schedule: Schedule
returns: Review
budget: { maxTurns: 13 }
---
1. Call listLanes and read both the current decision and archive lane. Parse the structured payload in each original receipt's text when present. Keep the receipt itself as provenance.
2. In the current decision lane, use the latest applicable record for the exact schedule, owner, and requested operation. Respect a withdrawal, a proposal only, stale revision, or missing authority. An archives entry cannot supersede a current decision. Another schedule's decision cannot authorize this schedule.
3. Before approving a change with a prerequisite, read the exact dependency via readSchedule and compare its live state with the record. Distinguish a real blocker from an unrelated or old notice. Preserve the relevant decision receipt and the blocker.
4. Resolve a requested handoff to the actual owned handoff lane only when named in both the user's goal and current approved decision. Return the decision and receipt, when current, even if the change is blocked by its required live dependency.
