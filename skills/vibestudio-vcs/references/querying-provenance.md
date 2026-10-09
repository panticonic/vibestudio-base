# Querying provenance

The semantic record is a relational database; query it as one when the
question is about a set. `provenance({ query: "SELECT …" })` runs one
read-only statement inside the workspace against a versioned set of `prov_*`
views. The underlying tables are private; the views are the contract.

## Discover the schema

The catalog describes itself, so start by querying it. `prov_schema` has one
row per relation, so the whole contract fits on one page. Read it, then read
the `columns` cell of the relation you need.

```ts
provenance({
  query: "SELECT relation, meaning, column_count FROM prov_schema",
});
provenance({
  query:
    "SELECT columns FROM prov_schema WHERE relation = 'prov_decision_entries'",
});
provenance({ query: "SELECT version FROM prov_schema_version" });
```

Use `WHERE relation = '…'` rather than `LIKE`: it is exact, and the deployed
engine enforces pattern limits that the development engine doesn't.

The relations are `prov_work_units` (resolved intent tier and text),
`prov_changes`, `prov_applied_changes`, `prov_content_edges`,
`prov_applications`, `prov_events`, `prov_event_parents`,
`prov_event_applications`, `prov_decisions`, `prov_decision_entries`,
`prov_counteractions`, `prov_external_deltas`, `prov_commands`,
`prov_invocations`, `prov_turns`, `prov_messages`, `prov_files`, and
`prov_search`.

## Limits the executor enforces

- One statement, which must be a `SELECT`. A non-recursive `WITH` is allowed.
- Only `prov_*` relations. Naming a private table is refused, with the name
  quoted.
- No recursive CTEs. Use `walk` for multi-hop traversal; the server bounds it.
- A plan check refuses full scans of large relations and cartesian joins
  _before_ execution. A query that reads past the scan budget is stopped
  mid-stream and returns the partial rows with a typed refusal.
- Text columns hold bounded excerpts. Use `read` for full content.
- A query can only return rows you could have reached by a permitted walk;
  visibility is the caller's.

## Refs, not IDs

ID columns render as compact `@ref`s, and you can use a `@ref` as a value in
query text. Trusted code replaces it with the full ID before execution:

```ts
provenance({
  query: `SELECT change_id, result_path FROM prov_changes WHERE work_unit_id = '@r3-9c1a'`,
});
```

Joins between `prov_` relations don't need any literal ID.

## Examples

**Everything one command touched**, grouped by path:

```sql
SELECT change.result_path AS path, count(*) AS changes
  FROM prov_work_units work
  JOIN prov_changes change ON change.work_unit_id = work.work_unit_id
 WHERE work.command_id = '@r5-2a1f'
 GROUP BY change.result_path
 ORDER BY changes DESC
```

**How two files are related.** Did the same work unit touch both?

```sql
SELECT work.work_unit_id, work.intent_tier, work.intent_text
  FROM prov_changes mine
  JOIN prov_changes theirs ON theirs.work_unit_id = mine.work_unit_id
  JOIN prov_work_units work ON work.work_unit_id = mine.work_unit_id
 WHERE mine.result_path = 'packages/api/src/retry.ts'
   AND theirs.result_path = 'packages/api/src/deploy.ts'
```

If this returns nothing, cause-walk both files and intersect the refs before
concluding they are unrelated.

**What a file has been _for_ over time**, with intent tiers:

```sql
SELECT work.created_at, work.intent_tier, work.intent_text
  FROM prov_changes change
  JOIN prov_work_units work ON work.work_unit_id = change.work_unit_id
 WHERE change.result_path = 'packages/api/src/retry.ts'
 ORDER BY work.created_at DESC
```

**Which stated intents undid other work:**

```sql
SELECT work.intent_text, count(*) AS undone
  FROM prov_counteractions counteraction
  JOIN prov_changes change ON change.change_id = counteraction.change_id
  JOIN prov_work_units work ON work.work_unit_id = change.work_unit_id
 WHERE work.intent_tier = 'stated'
 GROUP BY work.intent_text
 ORDER BY undone DESC
```

**Text search combined with a filter.** Decisions whose rationale mentions
retries:

```sql
SELECT hit.subject_id, entry.resolution, entry.rationale
  FROM prov_search hit
  JOIN prov_decision_entries entry ON entry.decision_id = hit.subject_id
 WHERE hit.subject_kind = 'decision' AND hit.text LIKE '%retry%'
```

For a ranked phrase search without SQL, use
`provenance({ target: "search: …" })` and walk from the ref it returns.

## When not to query

If the question is about a chain rather than a set, use a walk. It takes one
call, renders as a chain instead of a table, and the server manages its
bounds.
