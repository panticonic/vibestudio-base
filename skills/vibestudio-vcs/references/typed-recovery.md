# Typed recovery

Act on the structured error code and fields. Messages explain; don't parse
them.

## Basis and identity

- `RevisionChanged`: call status, compare against the new state, and call
  again.
- `CommandIdReuse`: an explicitly supplied command ID was already used for
  different content. Omit it and let the client mint one.
- `InvalidReference`: refresh the typed ID through status, inspect, list, or
  resolve. Don't rebuild opaque IDs.
- `Unauthorized`: stop and obtain the missing authority. Changing the payload
  doesn't fix it.

## Merge

- `ConflictPresent`: one or more selected coordinates conflict. Read every
  returned aspect, attribution chain, resolution list, and both intents. Choose
  `theirs` or `ours`, or write the correct combined state and choose
  `current`.
- `CoupledGroupIncomplete`: use the returned group and coordinates. Select all
  members together, or omit the list so the planner chooses a valid page.
- `ScopeTooLarge`: page the compare or narrow the coordinate selection. A
  structural group can't be divided; never drop members to make it fit.
- `IntegrationIncomplete`: a commit, finalization, or publication check found
  source coordinates with no reachable decision. Run the returned raw
  `vcs merge` or run-level `merge_subagent` recipe. Use `allRemaining: ours`
  to decline the remainder, or `current` with a rationale for a reviewed
  combined parent state, then commit again.
- `SourceIsAncestor`: the compare source is already in the target's history,
  so it has nothing to integrate. Follow the returned recovery,
  `vcs({ operation: "compare", view: "local" })`, to review local work
  against protected main.
- `MergeDriverError`: inspect `errorData.merges` and `errorData.review`.
  Earlier pages are already recorded; don't replay them. Resolve from the
  reported current review.
- `IntegrityFailure`: stop. The state difference can't be fully attributed, or
  a stored edge is inconsistent. Record the typed handle and coordinate. Don't
  write a compensating change or broaden a prompt.

## Authoring and lifecycle

- `DestinationOccupied`: inspect the file currently at the destination. Pick a
  free path, or deliberately edit or move the existing file.
- Re-running a finished merge returns `status: "unchanged"`, not a `NoEffect`
  error. `NoEffect` still applies to other authoring operations.
- `SubagentTerminal`: the subagent has already finished. Use the returned
  status, source event, and allowed operations; inspect, read, or merge the
  retained result instead of sending more instructions.
- `WorkingChangesPresent`: finish, commit, or discard the local chain before
  the operation that needs a clean state.
- `ConflictPresent` from revert: newer state means the counteraction would no
  longer be correct. Inspect the coordinate and write the result you want
  instead of forcing old bytes.

## Host effects and publication

- `ExternalEffectFailed`: the mutation or read is waiting on a host effect.
  Keep the command ID for an identical retry and inspect the effect
  diagnostics.
- `BuildGateFailed`: fix the returned candidate diagnostics, commit a new
  event, and push it. Never bypass the candidate gate.

## Retrying with the same command ID

Retry an uncertain response with the same command ID only when method,
arguments, expected basis, cause, and intent are byte-identical. Any change to
the basis, coordinate list, resolution, rationale, or intent makes it a new
request, which needs a new command ID.
