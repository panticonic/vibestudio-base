# Open authoring review

The managed baseline tests `workspace-natlang-authoring` and
`runtime-live-program-receipts` establish actual compiler diagnostics, public
signature and callable topology, service declarations and selector scopes,
and freshness of a result against an observed revision. Their harnesses bind
specific programs before invoking a review. The open workflow starts with the
user's goal and discovers the program and applicable release record first.

- `discoverAuthoring` gathers role, package title, and review context from the
  current owned workspace. `choosePrograms` identifies the candidate and any
  approved comparison by meaning. The discovery service enumerates and reads
  live records. Opening a selection binds exact workspace paths and the
  published contract for that candidate. Neither enumeration nor open receives
  the oracle verdict.
- `reviewProgram` reuses the installed authoring skill. Its compiler read is an
  exact service effect. Its lambdas triage diagnostics and reason about the
  signature, topology, services, and selector scope. The managed fixture uses
  the same workspace compiler adapter and reference contract comparison as the
  baseline authoring lane. The review performs no program execution.
- `workOnAuthoringGoal` coordinates the current receipt with the user's goal.
  `decideHandoff` applies the user's conditions to the verified disposition.
  A changed revision requires repeating discovery and review before offering a
  result. The control service checks freshness and writes an authorized scratch
  handoff atomically. Catalog metadata and released contracts come from the
  owned workspace. Oracle expectations, competing edits, and expected writes
  stay in System Testing.
