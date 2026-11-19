---
description: Determine whether the change needs checks against retained agentic events and channel history.
args:
  goal: string
  units: "{ owner: AgenticUnit | null; consumers: AgenticUnit[]; blockers: string[] }"
returns: "{ persistedContract: boolean; retainedHistoryChecks: string[] }"
---
Treat a changed event kind, terminal outcome, participant identity, stored-value encoding, hash input or replay reducer as a persisted contract change. Describe focused checks for fresh records and representative existing history relevant to that change. Check that producers and consumers agree on the one canonical representation. A UI-only presentation adjustment does not require a stored-history migration. For a change without a persisted contract impact, return an empty retainedHistoryChecks list.
