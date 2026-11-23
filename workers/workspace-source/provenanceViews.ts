// Builtin semantic-authority implementation.

/**
 * The relational contract of the semantic record.
 *
 * `prov_*` views — not the canonical tables — are the public surface an agent
 * may query. The tables stay private and freely refactorable; a refactor that
 * preserves view semantics is invisible to every agent surface.
 *
 * Every state-anchored view joins through the caller-scoped visibility basis
 * (`prov_vis_events`, `prov_vis_applications`, `prov_vis_commands`), which the
 * executor refills per query from the reachable context authorities the host
 * supplies. A static SQLite view cannot vary by caller, so the caller varies
 * the basis instead. The Durable Object is single-threaded, so a refilled
 * scratch table is exactly as caller-private as a temp table would be, and
 * unlike `CREATE TEMP TABLE` it needs no unversioned per-connection state.
 */

/** Bumped only with the view contract. Additive changes stay within a version. */
export const PROV_SCHEMA_VERSION = 1;

/** Version of the persisted workspace intent resolver. */
export const PROV_RESOLVER_PROTOCOL = "intent-ladder/v1";

export interface ProvColumnDescription {
  readonly column: string;
  readonly meaning: string;
}

export interface ProvRelationDescription {
  readonly relation: string;
  readonly meaning: string;
  readonly columns: readonly ProvColumnDescription[];
}

/** Self-describing catalog: the skill teaches the pattern, not the DDL. */
export const PROV_CATALOG: readonly ProvRelationDescription[] = [
  {
    relation: "prov_work_units",
    meaning:
      "One authored unit of work; resolved intent is the persisted ladder output.",
    columns: [
      {
        column: "work_unit_id",
        meaning: "Work unit identity (bind with an @ref).",
      },
      {
        column: "kind",
        meaning:
          "edit | file-transfer | lifecycle | merge | revert | import | external-unapplied.",
      },
      {
        column: "intent_tier",
        meaning: "stated | trigger | mechanical; never laundered.",
      },
      { column: "intent_text", meaning: "Resolved intent text at that tier." },
      {
        column: "resolver_protocol",
        meaning: "Intent-ladder protocol that produced the columns.",
      },
      {
        column: "author_context_id",
        meaning: "Context that authored the work.",
      },
      { column: "command_id", meaning: "Originating semantic command." },
      { column: "created_at", meaning: "Capture-time timestamp." },
      { column: "content_class", meaning: "internal | external." },
    ],
  },
  {
    relation: "prov_changes",
    meaning: "Authored changes with their base and result coordinates.",
    columns: [
      { column: "change_id", meaning: "Change identity." },
      { column: "work_unit_id", meaning: "Authoring work unit." },
      {
        column: "kind",
        meaning: "Change kind (file-create, text-edit, file-delete, …).",
      },
      {
        column: "file_id",
        meaning: "Result file identity when the change places a file.",
      },
      { column: "repository_id", meaning: "Result repository identity." },
      { column: "base_path", meaning: "Path before the change." },
      { column: "result_path", meaning: "Path after the change." },
      {
        column: "effect_digest",
        meaning: "Canonical digest of the change effect.",
      },
    ],
  },
  {
    relation: "prov_applied_changes",
    meaning: "Realization of a change on one exact basis.",
    columns: [
      { column: "applied_change_id", meaning: "Applied change identity." },
      { column: "application_id", meaning: "Owning application." },
      { column: "change_id", meaning: "Authored change." },
      { column: "ordinal", meaning: "Order within the application." },
    ],
  },
  {
    relation: "prov_content_edges",
    meaning:
      "Immediate content-coordinate lineage from edits to earlier edits or initial snapshot files.",
    columns: [
      { column: "child_applied_change_id", meaning: "Later applied change." },
      {
        column: "parent_ref_json",
        meaning: "Earlier edit or initial snapshot file reference.",
      },
      { column: "relation", meaning: "preserves | copies | incorporates." },
    ],
  },
  {
    relation: "prov_events",
    meaning: "Committed workspace events visible to the caller.",
    columns: [
      { column: "event_id", meaning: "Event identity." },
      { column: "kind", meaning: "genesis | commit | integration-commit." },
      { column: "message", meaning: "Commit message." },
      { column: "created_at", meaning: "Commit timestamp." },
    ],
  },
  {
    relation: "prov_event_parents",
    meaning: "Immediate event ancestry (no stored transitive closure).",
    columns: [
      { column: "event_id", meaning: "Child event." },
      { column: "parent_event_id", meaning: "Parent event." },
      { column: "ordinal", meaning: "Parent order; 0 is the first parent." },
    ],
  },
  {
    relation: "prov_event_applications",
    meaning: "Applications carried by an event.",
    columns: [
      { column: "event_id", meaning: "Event identity." },
      { column: "application_id", meaning: "Application identity." },
      { column: "ordinal", meaning: "Order within the event." },
    ],
  },
  {
    relation: "prov_applications",
    meaning: "One realization of one work unit on one basis.",
    columns: [
      { column: "application_id", meaning: "Application identity." },
      { column: "work_unit_id", meaning: "Realized work unit." },
      { column: "basis_kind", meaning: "event | application." },
      { column: "basis_id", meaning: "Exact basis identity." },
    ],
  },
  {
    relation: "prov_decisions",
    meaning: "Integration decisions owned by a merge work unit.",
    columns: [
      { column: "decision_id", meaning: "Decision identity." },
      { column: "work_unit_id", meaning: "Owning merge work unit." },
      { column: "target_state_kind", meaning: "event | application." },
      { column: "target_state_id", meaning: "Exact target state." },
      {
        column: "source_event_id",
        meaning: "Integrated source event, when any.",
      },
      {
        column: "source_delta_id",
        meaning: "Integrated external delta, when any.",
      },
      { column: "created_at", meaning: "Decision timestamp." },
    ],
  },
  {
    relation: "prov_decision_entries",
    meaning:
      "Per-coordinate accounting of one decision; `ours`/`current` are rejections.",
    columns: [
      { column: "decision_id", meaning: "Owning decision." },
      { column: "coordinate_kind", meaning: "file | repository." },
      { column: "coordinate_id", meaning: "Coordinate identity." },
      {
        column: "resolution",
        meaning: "adopt | convergent | composed | ours | current.",
      },
      { column: "rationale", meaning: "Recorded rationale prose, when any." },
      {
        column: "result_change_id",
        meaning: "Change the resolution produced, when any.",
      },
    ],
  },
  {
    relation: "prov_counteractions",
    meaning: "A change that undoes another; the negative-evidence edge.",
    columns: [
      { column: "change_id", meaning: "Counteracting change." },
      { column: "counteracted_change_id", meaning: "Change that was undone." },
    ],
  },
  {
    relation: "prov_external_deltas",
    meaning: "Declared changes made outside the workspace.",
    columns: [
      { column: "delta_id", meaning: "External delta identity." },
      { column: "work_unit_id", meaning: "Declaring work unit." },
      { column: "repository_id", meaning: "Affected repository." },
      { column: "repo_path", meaning: "Repository path." },
      { column: "status", meaning: "active | superseded | finalized." },
      {
        column: "superseded_by_delta_id",
        meaning: "Superseding delta, when any.",
      },
      { column: "created_at", meaning: "Declaration timestamp." },
    ],
  },
  {
    relation: "prov_commands",
    meaning:
      "The command journal: the join between semantic work and trajectories.",
    columns: [
      { column: "command_id", meaning: "Command identity." },
      { column: "method", meaning: "Semantic method name." },
      { column: "status", meaning: "pending | effect-pending | complete." },
      {
        column: "cause_invocation_id",
        meaning: "Causing tool invocation, when any.",
      },
      { column: "cause_log_id", meaning: "Causing trajectory log." },
      { column: "cause_head", meaning: "Causing trajectory head." },
      { column: "created_at", meaning: "Command timestamp." },
    ],
  },
  {
    relation: "prov_invocations",
    meaning: "Trajectory invocations causally linked to visible commands.",
    columns: [
      { column: "log_id", meaning: "Trajectory log." },
      { column: "head", meaning: "Trajectory head." },
      { column: "invocation_id", meaning: "Invocation identity." },
      { column: "turn_id", meaning: "Owning turn." },
      { column: "status", meaning: "Invocation status." },
      { column: "terminal_outcome", meaning: "Terminal outcome, when any." },
      { column: "input_log_id", meaning: "Actual native originating input's channel log." },
      { column: "input_head", meaning: "Actual native input's canonical head." },
      { column: "input_message_id", meaning: "Exact message admitted to the native task." },
    ],
  },
  {
    relation: "prov_turns",
    meaning: "Trajectory turns reachable from visible invocations.",
    columns: [
      { column: "log_id", meaning: "Trajectory log." },
      { column: "head", meaning: "Trajectory head." },
      { column: "turn_id", meaning: "Turn identity." },
      { column: "ordinal", meaning: "Turn order." },
      {
        column: "trigger_message_id",
        meaning: "Message that opened the turn.",
      },
      { column: "summary", meaning: "Turn summary, when any." },
    ],
  },
  {
    relation: "prov_messages",
    meaning:
      "Trajectory messages with a bounded excerpt; inspect the message ref for its full recorded text.",
    columns: [
      { column: "log_id", meaning: "Trajectory log." },
      { column: "head", meaning: "Trajectory head." },
      { column: "message_id", meaning: "Message identity." },
      { column: "turn_id", meaning: "Owning turn." },
      { column: "role", meaning: "user | assistant | system | tool." },
      { column: "sender_kind", meaning: "Sender principal kind." },
      { column: "sender_id", meaning: "Sender principal identity." },
      {
        column: "source_message_id",
        meaning: "Message this one continues from.",
      },
      {
        column: "text_excerpt",
        meaning: "Leading excerpt of the message text, bounded by the view.",
      },
      {
        column: "text_length",
        meaning:
          "Full recorded length; longer than the excerpt means text was cut, so inspect the ref.",
      },
    ],
  },
  {
    relation: "prov_files",
    meaning: "File coordinates as the caller's visible basis last placed them.",
    columns: [
      { column: "file_id", meaning: "Stable file identity." },
      { column: "repository_id", meaning: "Repository identity." },
      { column: "path", meaning: "Path at the last visible placement." },
      { column: "presence", meaning: "placed | deleted." },
      {
        column: "last_change_id",
        meaning: "Change that last placed the coordinate.",
      },
    ],
  },
  {
    relation: "prov_search",
    meaning: "Full-text entry by content over stored prose.",
    columns: [
      {
        column: "subject_kind",
        meaning:
          "work-unit | decision | event | external-delta | trajectory-message.",
      },
      { column: "subject_id", meaning: "Subject identity." },
      { column: "log_id", meaning: "Trajectory log for message subjects." },
      { column: "head", meaning: "Trajectory head for message subjects." },
      { column: "label", meaning: "Short human label for the subject." },
      { column: "text", meaning: "Indexed prose." },
    ],
  },
  {
    relation: "prov_schema",
    meaning: "This catalog. One row per relation; query it first to learn the contract.",
    columns: [
      { column: "relation", meaning: "View name." },
      { column: "meaning", meaning: "What the relation means." },
      { column: "column_count", meaning: "How many columns the relation has." },
      {
        column: "columns",
        meaning: "Every column as `name — meaning`, separated by `; `.",
      },
    ],
  },
  {
    relation: "prov_schema_version",
    meaning: "The version of this view contract.",
    columns: [{ column: "version", meaning: "Contract version integer." }],
  },
];

export const PROV_RELATIONS: ReadonlySet<string> = new Set(
  PROV_CATALOG.map((relation) => relation.relation),
);

const sqlText = (value: string): string => `'${value.replaceAll("'", "''")}'`;

/**
 * A catalog nobody can finish reading is not self-describing. One row per column
 * put the contract at 104 rows against a 50-row default page, so the single
 * taught discovery call could never complete and an agent learned only the
 * alphabetically-first relations. One row per relation keeps the whole contract
 * inside one page, with the column detail carried along in `columns`.
 *
 * A VALUES rowset also has no compound-SELECT term limit. The original UNION ALL
 * form crossed workerd's SQLite deployment limit as the contract grew and
 * stopped an otherwise healthy workspace from starting.
 */
export function provenanceCatalogSelect(): string {
  const rows = PROV_CATALOG.map((relation) => {
    const columns = relation.columns
      .map((column) => `${column.column} — ${column.meaning}`)
      .join("; ");
    return (
      `(${sqlText(relation.relation)}, ${sqlText(relation.meaning)}, ` +
      `${relation.columns.length}, ${sqlText(columns)})`
    );
  });
  return (
    "SELECT column1 AS relation, column2 AS meaning, column3 AS column_count, " +
    "column4 AS columns\n" +
    `FROM (VALUES\n${rows.join(",\n")}\n)`
  );
}
