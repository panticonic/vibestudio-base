---
name: provenance-orientation
description: Recover why tracked state is the way it is — what was attempted, what else happened under that intent, what was rejected, and which subjects match a description.
---

# Provenance orientation

Read [Vibestudio VCS](../vibestudio-vcs/SKILL.md) first. Provenance is the
set of edges linking semantic VCS and trajectory records, not a separate
store.

Use it to find the reasons behind past choices before changing them. Users
ask for consequences ("cap the backoff at 30s") and rarely state the
underlying constraint ("this deploy target kills long-lived connections").
Reconstruct enough of the record to infer that constraint before acting
against it.

## Pick the mechanism for your question

| Question                                                        | Mechanism                                                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Why do these bytes exist?                                       | Already attached to the managed `read`; stop there if it answers the question                             |
| What was actually being attempted?                              | `provenance({ target, walk: "cause" })`                                                                   |
| What else happened under that intent?                           | `provenance({ target, walk: "cohort" })`                                                                  |
| How are these two things related?                               | Cause-walk both and intersect the refs, or write one `query` join                                         |
| What has this coordinate been _for_?                            | `vcs({ operation: "blame" })` and file history, read for intent drift                                     |
| What was tried and rejected here?                               | `provenance({ target, walk: "rejections" })`                                                              |
| Which subjects match a description?                             | `provenance({ target: "search: some words" })`                                                            |
| Which record mentions a name or decision no current file holds? | In Personal, use its installed `memory_recall({ query })` tool; elsewhere use the provenance search above |
| A set-shaped question ("all X where Y")                         | `provenance({ query: "SELECT …" })`                                                                       |
| Nothing above fits                                              | `provenance({ target })` for one subject's direct edges                                                   |

Each should take one call. If you are walking a chain by hand over five
calls, you picked the wrong mechanism.

```ts
provenance({ target: "packages/example/src/index.ts", walk: "cause" });
provenance({ target: "@r7-1c9a", walk: "cohort", scope: "turn" });
provenance({ target: "packages/example/src/retry.ts", walk: "rejections" });
provenance({ target: "search: retry backoff" });
provenance({ query: "SELECT relation, meaning, columns FROM prov_schema" });
provenance({ targets: ["@r3-11ab", "@r4-77cd"] });
```

`target` is the only way to select a subject: a managed path, `session`, a
semantic shorthand, a `search:` phrase, or a compact `@ref` you were given.
`targets` expands up to ten refs in one call. Never repeat a long
content-addressed ID; trusted code keeps the full roots, and every rendered
subject carries the `@ref` to pass back.

Queries cover everything visible in the context. Don't combine `query` with
`target`, `targets`, or a walk; a target doesn't filter SQL. To limit a query
to one repository, inspect the repository's managed root first and compare
`repository_id` with the returned repository `@ref` in the query. A managed
path is not a repository ID. Read `prov_schema.columns` for the full column
list before writing joins or filters.

## What each walk returns

- **cause**: one indented narrative from the artifact up through applied
  change → work unit → command → invocation → turn → trigger message. It
  follows message sources until it reaches a human statement or a labeled
  boundary (subagent brief, external delta, import snapshot, or something
  outside your visibility). Intents come first, mechanics after. A boundary
  is a normal result, not an error; the walk never invents a connection
  across it.
- **cohort**: everything else the same `work-unit`, `command`, or `turn`
  touched, grouped by coordinate, decision, and commit. Underlying constraints
  usually show up as patterns across a cohort, not in a single edit.
- **rejections**: counteracted changes with the intent of the work that undid
  them, revert work, superseded external deltas, and merge coordinates
  resolved `ours`/`current`. A user saying _no_ is the strongest evidence in
  the record; check it before repeating work that was already rejected.

## Inferring the underlying constraint

1. **Gather**: `cause` for what was asked, `cohort` for the pattern, and
   `rejections` for counter-evidence.
2. **Hypothesize** a constraint that explains all three. It is usually a
   property of the environment, not of the file you are looking at. Look for
   what the recorded choices have in common: three settings all kept short is
   evidence about _time_, not separately about retries, sockets, and uploads.
3. **Check** the hypothesis against the rejections and the intent-annotated
   history. If a rejection contradicts it, the hypothesis is wrong.

   **Don't dismiss a rejection because its subject differs from yours.** The
   most common mistake is to read "someone raised the retry backoff and it was
   undone" as a fact only about retries, conclude it doesn't apply to the
   keepalive you are adding, and repeat the rejected work under another name.
   Ask what property the rejected work shares with yours. If your change has
   that property, the rejection applies to it, wherever it was recorded. Say
   so before acting and let the user decide.

4. **Write it down** if it will come up again: a paragraph in the relevant
   notes file, with the edit's `intent` naming the evidence. There is no
   separate store for this; the VCS already gives the note authorship,
   history, and revisions.
5. **Treat an existing note as a starting assumption, not ground truth.**
   Every written-down constraint is someone's inference. When the stakes
   justify it, re-check it with the walks above. If the evidence contradicts
   it, edit the note or say so; don't silently follow or silently ignore it.

## Interpret evidence narrowly

Keep actor, executor, cause, intent, authorization, and content origin
separate. An edge records a relationship; it doesn't make every upstream claim
true.

Intent tiers are not interchangeable: `stated` is explicit purpose, `trigger`
is recorded assignment evidence, and `mechanical` describes only the effect.
Don't invent private reasoning or authorship from a turn summary, and don't
turn a `mechanical` line into a claim about what someone wanted.

A copy explanation should reach the copy's direct source coordinate. A merge
explanation should reach the decision and the source changes it accounted
for. At an external import boundary, report the recorded source kind,
credential-free URI, revision, and target repositories as facts about the
snapshot. The importer's intent explains why the bytes entered Vibestudio, not
who wrote them earlier.

Every result is bounded and limited to what you may read. A pruned branch
shows as a labeled boundary, a long list as a counted omission plus a `@ref`,
and an over-broad query as a typed refusal that names the offending term.
Narrow the question; don't retry it with a larger scope.
