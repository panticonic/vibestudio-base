---
name: vibestudio-vcs
description: Semantic workspace VCS for managed authoring, net-effect merges, provenance, commit, revert, snapshots, and protected-main publication. Not for context-local scratch files or unrelated Git repositories.
---

# Vibestudio semantic VCS

To scaffold or fork a panel/worker repository, including reviewing a dry-run
plan, use [workspace development](../workspace-dev/PROJECTS.md); VCS then
commits and publishes the reviewed context. Forking a context alone does not
create a derived project repository.

Managed workspace state is semantic history, not a Git worktree. Tools:

- `apply_patch`: atomic multi-file text/binary writes, exact replacements,
  deletes, and mode changes.
- `edit` or `write`: one simple text change.
- `move_file` / `copy_file`: transfers that keep file identity and lineage.
- `vcs`: status, compare, merge, revert, commit, discard, blame, and push.
- `provenance`: the only agent-facing graph walker, for typed roots and their
  edges.

## Rules

- Treat every event, application, repository, file, change, work unit, and
  decision ID as opaque. Copy returned IDs unchanged.
- Pass the newest returned `workingHead` to the next mutation. On
  `RevisionChanged`, re-read status and re-plan; don't rewrite the expected
  basis.
- Edits stay local until you commit the whole chain. Never emulate a move or
  copy with read plus write.
- Add `intent` only when the purpose isn't clear from the request, e.g.
  `intent: "Remove the cache because it hides the request race"`. Omit it
  when it would restate the request.
- Merges combine sources by stable coordinate and net effect. Recorded
  operations are provenance, not steps to replay.
- A merge is finished only when `resolution.complete && resolution.concluded`.
- Push only a clean committed event, after focused verification.

## Core workflow

1. Run `vcs({ operation: "status" })` to see the current chain. Agent-facing
   mutations bind the live `workingHead` themselves; you don't need status
   before each one.
2. Read the smallest relevant part of the workspace. Managed reads may attach
   bounded memory with intent and causality.
3. Make changes with `apply_patch`, `edit`/`write`, or
   `move_file`/`copy_file` as above.
4. To see everything changed in this context, including uncommitted
   applications, use the local comparison. No status or history call is
   needed first:

   ```js
   vcs({ operation: "compare", view: "local" });
   ```

   Compare is read-only and takes no `intent`.

5. For incoming committed work, call merge directly. The agent tool merges
   every clean page in one call, never picks a conflict on its own, and
   returns the final resolution, counts, intents, composed-review evidence,
   and one page of conflicts. Compare first only for a read-only preview:

   ```js
   vcs({ operation: "compare", source: "event:...", limit: 500 });
   ```

6. Compare results have two views:
   - `coordinates` (mechanical): each entry is `adopt`, `convergent`,
     `composed`, `conflict`, or `resolved`, with aspect values and full
     attribution.
   - `intents` (semantic): each has evidence tier `stated`, `trigger`, or
     `mechanical`. `split` and `contested` mean "look closer"; they never
     block a merge.

7. Merge clean work. Without `coordinates`, the driver works through every
   bounded page; an explicit `coordinates` list selects one page:

   ```js
   vcs({
     operation: "merge",
     source: "event:...",
     intent: "Bring the reviewed child implementation into the parent",
   });
   ```

8. Review every returned `composed` entry. Composing non-overlapping text is
   mechanically safe, not a semantic approval.
9. Resolve conflicts per coordinate:
   - `theirs`: accept the source coordinate.
   - `ours`: keep ours and explicitly decline the source coordinate.
   - `current`: accept the current head, after writing the correct combined
     result with the edit tools.

   ```js
   vcs({
     operation: "merge",
     source: "event:...",
     resolutions: [
       {
         coordinate: { kind: "file", id: "file:..." },
         resolution: "current",
         rationale:
           "The current file combines the retry contract with the local validation",
       },
     ],
     intent: "Conclude the reviewed hand merge",
   });
   ```

   To decline everything still undecided, including clean coordinates, use
   `resolutions: { allRemaining: { resolution: "ours" } }`. After writing a
   combined parent result, use `current` with a required rationale instead.
   The blanket decision is safe to repeat across pages and never accepts
   source content implicitly.

10. The merge result is the completion receipt. `status: "unchanged"` means
    it was already applied, not an error; still check `resolution.complete`.
    If conflicts overflow one result, continue by copying the advertised
    `compare` call with its compact ref.
11. Run focused tests and commit the complete chain. A source that compare
    reports as `complete: true, concluded: false` (convergent or net-zero) is
    concluded by the commit that names it with `concludes: "event:..."`;
    commit refuses with `IntegrationIncomplete` if it still has undecided
    coordinates. Commit verifies the
    context is clean at the new event. Check status only if you need more
    orientation, then push if requested.

## Commit and publication

`vcs({ operation: "commit", message, concludes?, intent? })` commits the
complete local chain. Merge parents come only from merge decisions, including
the decision-only conclusion that `concludes` records atomically.

`vcs({ operation: "push" })` publishes the committed event. It revalidates
every merge parent by coordinate, runs the protected candidate checks, and
never includes uncommitted work.

## Recovery

- `ConflictPresent`: the selected coordinate conflicts and has no resolution.
  Read its aspects, attributions, allowed resolutions, and both intents.
- `CoupledGroupIncomplete`: the selection split a structural group. Select the
  whole group, or omit `coordinates` so the planner picks a valid page.
- `ScopeTooLarge`: narrow the compare page or selection; never split a coupled
  group.
- `IntegrityFailure`: stop. Reachable provenance can't explain the state;
  don't work around it.
- `IntegrationIncomplete`: follow the returned merge recipe. Use
  `allRemaining: ours` to decline the rest of the source, or `current` with a
  rationale after reviewing a correct combined state.
- `NoEffect`: inspect current state. Report success only if the requested
  outcome is already true.

## Reference map

- [Authoring basics](references/authoring-basics.md)
- [Contexts and exact state](references/contexts-and-state.md)
- [Compare and merge](references/compare-and-merge.md)
- [File move and copy](references/file-move-copy.md)
- [Revert and counteractions](references/revert-counteractions.md)
- [Semantic commit](references/semantic-commit.md)
- [Provenance, intent, and blame](references/provenance-and-blame.md)
- [Querying provenance](references/querying-provenance.md)
- [External snapshot import](references/external-snapshot-import.md)
- [Checks and publication](references/checks-and-publication.md)
- [Typed recovery](references/typed-recovery.md)
- [Scenarios](references/scenarios.md)
- [Generated public contract](references/public-contract.md)

`help("vcs")` lists methods and `help("vcs.merge")` shows one method's live
contract. The generated contract and `help` define the method list. Agent
tools cover the common workflow; direct runtime callers use the same
contracts with explicit service fields.
