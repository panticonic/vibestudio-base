# Commit, discard, and push

## Commit the complete local chain

Check the working counts and head with `vcs.status`, and run the relevant
tests before committing.

Inside an agent, call `vcs({ operation: "commit", message, intent? })`. Add
`intent` when the milestone's purpose isn't already clear from the request,
not to paraphrase the message. The tool derives the working head and a
globally unique command ID from the current invocation. Commit takes every
local application in order and returns one immutable event; it doesn't accept
a subset. Authorized direct runtime, CLI, or lifecycle clients call
`vcs.commit` with those fields; their causal chain ends at the semantic
command rather than pretending to be an agent.

When finishing a merge, commit derives the merge sources from decisions in the
local chain. Decisions for several source events are normal, for example when
merging several subagents. There is no separate input for merge parents. A
convergent or net-zero source that compare reports as complete but not
concluded is named with `concludes`; commit records its decision-only
application in the same command. Commit checks that every coordinate a source
touched has a reachable decision. The new event's first parent is the previous committed
event, followed by each merge source in order.

Afterwards the context is clean: the committed pointer and working head both
name the new event.

`vcs.status.integrating` is a constant-time view of unfinished integration.
Each row reports its source, remaining/mergeable/conflict counts, conclusion,
snapshot head, and `stale`. A stale row reflects only the last merge-decision
snapshot; the commit check is always current. A successful commit clears the
rows it integrates.

## Discard the complete local chain

Inside an agent, call `vcs({ operation: "discard" })` only when all
uncommitted applications should be dropped; the tool supplies the live head
and command ID. Direct clients call `vcs.discard` with those inputs. It
returns the discarded application IDs and restores the committed event as
working head. To undo one change and keep the rest, use `revert`.

## Publish a committed event

Inside an agent, commit first, then call `vcs({ operation: "push" })`; the
tool supplies the committed event, observed main event, and command ID, and
returns `IntegrationRequired` without pushing when main has moved. Runtime
code calls `vcs.publish({ message? })`, which also commits any uncommitted
chain first.

Push validates event ancestry and that every coordinate is accounted for,
runs the candidate build/typecheck/authority gate for the changed units and
their transitive dependents, obtains publication approval, and advances the
protected refs atomically as one durable effect. It records no new source
history. Run the same context report yourself first for faster feedback. Any
semantic, build-gate, approval, authorization, or atomic-ref refusal advances
nothing.

A content-identical committed event is still a real advance of semantic main
and needs approval; expect an event-level approval, not a file diff. Only
replaying an already-applied publication skips approval.

Refusals:

- `RevisionChanged`: re-read status and merge the new main if needed.
- `IntegrationIncomplete`: follow the structured recovery recipe. Use
  `allRemaining: ours` to decline the remainder, or `current` with a rationale
  after reviewing the combined state, then commit again. In a supervising
  agent the refusal names the matching `merge_subagent` run; elsewhere a raw
  `vcs merge` with the retained source event.
- `Unauthorized`: stop and use the declared approval flow.
- `ExternalEffectFailed`: reuse the command ID only to retry the identical
  request when its outcome is uncertain.

After success, check the returned `eventId`, `mainEventId`, and durable effect
ID.
