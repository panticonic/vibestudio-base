---
name: mission-control-store
description: Maintain Mission Control projects, task cards, saved views, and canonical execution links.
---

# Mission Control domain

`MissionControlStore` owns planning records; `MissionsDO` owns every execution
and schedule. Keep that boundary: never introduce a second run ledger,
transcript store, scheduler, heartbeat, timeout, or alternate agent loop here.

Read a card before updating it and supply its observed revision. Preserve
independent fields and re-read conflicts. Dependencies are a directed acyclic
graph across workspace projects; moving a task preserves its identity, links
and run history. Card work state and executor lifecycle state are distinct.

Use the paginated `overview` for the shared presentation view and `taskOptions`
for choices independent of filters. `taskDetail` reads one exact task's
canonical automation and paged run ledger. Persist only automation identity,
never copies of run status or chat transcripts.

The stable executor prompt names task identity and reads current domain state
at run start. Recurring cards represent a series: Done accepts the preceding
occurrence, and the next admitted scheduled occurrence may begin new work.
Cancelled cards and archived projects stop work. Dependency acceptance still
gates every occurrence.

Cancellation belongs to MissionsDO, including admission and preparation;
mark the task cancelled only after its canonical cancellation returns. A
failed join leaves the original failure visible and the card actionable.
Archive only after execution commands, live runs, and enabled recurrence have
stopped. Retain task history across archive and restore.

Run focused tests through the host's template projection, as documented in
the panel README. Inspect the real exact-unit build report for source,
manifest and authority diagnostics before attempting runtime calls.
