---
description: Resolve an owned scheduled automation goal against current schedules and retained user decisions.
args:
  goal: string
returns: ScheduledOutcome
budget: { maxTurns: 24 }
---
1. Call discoverSchedules with the goal. Keep the exact schedule and the other current schedule options.
2. Call reviewRetainedInput with the goal and chosen schedule. A proposal or an archive is evidence rather than current authorization. Use the current owner, revision, requested operation and prerequisite to evaluate any apparent decision.
3. Call applyChange on the result. It may return a changed revision or dependency. Call discoverSchedules.readSchedule again and re-evaluate retained authorization against the newer state before drawing conclusions. Never apply stale authorization to a new revision.
4. Call confirmEffects and return the most recent schedule it actually observed. Keep the exact relevant authorized receipt, if established.
5. When the user asked for an owned handoff and the accepted decision includes that destination, call recoverHandoff. If the submit answer is interrupted, recover the original receipt. Return the independently observed schedule and any actual receipt, with a concise reason grounded in the result.
