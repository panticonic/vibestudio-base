import type { SqlStorage } from "@vibestudio/durable";

/** Versioned workspace facts retained by both history stores during replay. */
export function createSemanticHistoryTables(sql: SqlStorage): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS workspace_template_installations (
      event_id TEXT PRIMARY KEY,
      installation_json TEXT NOT NULL CHECK (json_valid(installation_json) = 1)
    );

    CREATE TABLE IF NOT EXISTS gad_work_units (
      work_unit_id TEXT PRIMARY KEY,
      command_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (
        kind IN ('edit', 'file-transfer', 'lifecycle', 'merge', 'revert', 'import',
                 'external-unapplied')
      ),
      intent_summary TEXT,
      author_context_id TEXT NOT NULL,
      trigger_excerpt TEXT,
      trigger_sender_json TEXT,
      external_snapshot_json TEXT,
      content_class TEXT NOT NULL CHECK (content_class IN ('internal', 'external')),
      external_lineage_json TEXT NOT NULL CHECK (
        json_valid(external_lineage_json) = 1
        AND json_type(external_lineage_json) IS 'array'
        AND (content_class = 'external' OR json_array_length(external_lineage_json) = 0)
      ),
      normalization_protocol TEXT NOT NULL,
      -- Frozen output of the one intent loader over evidence that is itself
      -- immutable once the row exists. This is derived-but-frozen input for
      -- SQL carriers (views cannot call the loader), not a cache that can go
      -- stale under it; a resolver protocol change ships a recompute that runs
      -- through the same loader and bumps resolver_protocol.
      resolved_intent_text TEXT,
      resolved_intent_tier TEXT CHECK (
        resolved_intent_tier IS NULL
        OR resolved_intent_tier IN ('stated', 'trigger', 'mechanical')
      ),
      resolver_protocol TEXT,
      created_at TEXT NOT NULL,
      -- Trigger evidence is well-formed or absent. It is deliberately *not*
      -- conditioned on intent_summary: which rung the ladder resolves to is the
      -- resolver's decision, and making the schema enforce "no statement when
      -- the author wrote a summary" destroyed the requester's own words for
      -- every work unit an author bothered to describe.
      CHECK (
        (trigger_excerpt IS NULL AND trigger_sender_json IS NULL)
        OR (trigger_excerpt IS NOT NULL
          AND trigger_sender_json IS NOT NULL
          AND json_valid(trigger_sender_json) = 1)
      ),
      CHECK (
        (kind = 'import'
          AND external_snapshot_json IS NOT NULL
          AND json_valid(external_snapshot_json) = 1
          AND json_type(external_snapshot_json, '$.targetRepositoryIds') IS 'array'
          AND json_array_length(external_snapshot_json, '$.targetRepositoryIds') >= 1)
        OR (kind <> 'import' AND external_snapshot_json IS NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_gad_work_units_command
      ON gad_work_units(command_id, work_unit_id);

    CREATE TABLE IF NOT EXISTS gad_external_deltas (
      delta_id TEXT PRIMARY KEY,
      work_unit_id TEXT NOT NULL UNIQUE,
      owner_context_id TEXT NOT NULL,
      repository_id TEXT NOT NULL,
      repo_path TEXT NOT NULL,
      target_state_kind TEXT NOT NULL CHECK (target_state_kind IN ('event', 'application')),
      target_state_id TEXT NOT NULL,
      old_source_json TEXT NOT NULL CHECK (json_valid(old_source_json) = 1),
      new_source_json TEXT NOT NULL CHECK (json_valid(new_source_json) = 1),
      old_snapshot TEXT NOT NULL,
      new_snapshot TEXT NOT NULL,
      input_digest TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'superseded', 'finalized')),
      superseded_by_delta_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gad_external_deltas_repository
      ON gad_external_deltas(repository_id, status, delta_id);

    -- A Change is the expressive authored record (text, binary, create,
    -- delete, mode, move, copy, repository lifecycle, and exact content replacement).
    CREATE TABLE IF NOT EXISTS gad_changes (
      change_id TEXT PRIMARY KEY,
      work_unit_id TEXT NOT NULL,
      operation INTEGER NOT NULL CHECK (operation >= 0),
      ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
      kind TEXT NOT NULL,
      source_json TEXT,
      base_json TEXT,
      result_json TEXT,
      payload_json TEXT NOT NULL,
      effect_digest TEXT NOT NULL,
      CHECK (
        (kind = 'file-copy'
          AND source_json IS NOT NULL
          AND json_valid(source_json) = 1
          AND json_extract(source_json, '$.kind') = 'file'
          AND json_type(source_json, '$.state') = 'object'
          AND json_extract(source_json, '$.state.kind') IN ('event', 'application')
          AND json_extract(source_json, '$.repositoryId') <> ''
          AND json_extract(source_json, '$.fileId') <> ''
          AND json_extract(source_json, '$.path') <> ''
          AND json_extract(source_json, '$.contentHash') <> '')
        OR (kind <> 'file-copy' AND source_json IS NULL)
      ),
      UNIQUE (work_unit_id, operation, ordinal)
    );
    CREATE INDEX IF NOT EXISTS idx_gad_changes_work_unit
      ON gad_changes(work_unit_id, change_id);
    CREATE INDEX IF NOT EXISTS idx_gad_changes_authored_source
      ON gad_changes(
        json_extract(source_json, '$.fileId'),
        json_extract(source_json, '$.state.kind'),
        coalesce(
          json_extract(source_json, '$.state.eventId'),
          json_extract(source_json, '$.state.applicationId')
        ),
        change_id
      ) WHERE source_json IS NOT NULL;

    CREATE TABLE IF NOT EXISTS gad_change_coordinates (
      change_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('base', 'result')),
      repository_id TEXT,
      repo_path TEXT,
      file_id TEXT,
      path TEXT,
      PRIMARY KEY (change_id, role)
    );
    CREATE INDEX IF NOT EXISTS idx_gad_change_coordinates_file
      ON gad_change_coordinates(file_id, change_id, role);
    CREATE INDEX IF NOT EXISTS idx_gad_change_coordinates_repository
      ON gad_change_coordinates(repository_id, change_id, role);

    -- Queryable projection of the expressive counteraction list in payload_json.
    -- This is an immediate edge index, not a stored transitive closure.
    CREATE TABLE IF NOT EXISTS gad_change_counteractions (
      change_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
      counteracted_change_id TEXT NOT NULL,
      PRIMARY KEY (change_id, ordinal),
      UNIQUE (change_id, counteracted_change_id)
    );
    CREATE INDEX IF NOT EXISTS idx_gad_change_counteractions_reverse
      ON gad_change_counteractions(counteracted_change_id, change_id);

    CREATE TABLE IF NOT EXISTS gad_applied_changes (
      applied_change_id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      change_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
      applied_base_json TEXT,
      applied_result_json TEXT,
      UNIQUE (application_id, ordinal),
      UNIQUE (application_id, change_id)
    );
    CREATE INDEX IF NOT EXISTS idx_gad_applied_changes_change
      ON gad_applied_changes(change_id, application_id);

    CREATE TABLE IF NOT EXISTS gad_applied_change_predicates (
      applied_change_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
      predicate_json TEXT NOT NULL,
      predicate_digest TEXT NOT NULL,
      PRIMARY KEY (applied_change_id, ordinal),
      UNIQUE (applied_change_id, predicate_digest)
    );
    CREATE INDEX IF NOT EXISTS idx_gad_applied_change_predicates_digest
      ON gad_applied_change_predicates(predicate_digest, applied_change_id);

    -- Initial snapshot files and applied changes form the content graph used by
    -- preservation, copies, integration, history, and blame.
    CREATE TABLE IF NOT EXISTS gad_content_edges (
      content_edge_id TEXT PRIMARY KEY,
      child_applied_change_id TEXT NOT NULL,
      parent_ref_json TEXT NOT NULL CHECK (json_valid(parent_ref_json)),
      relation TEXT NOT NULL CHECK (relation IN ('preserves', 'copies', 'incorporates')),
      UNIQUE (child_applied_change_id, parent_ref_json, relation)
    );
    CREATE INDEX IF NOT EXISTS idx_gad_content_edges_origin
      ON gad_content_edges(parent_ref_json, content_edge_id);
    CREATE INDEX IF NOT EXISTS idx_gad_content_edges_parent
      ON gad_content_edges(json_extract(parent_ref_json, '$.appliedChangeId'), child_applied_change_id);

    CREATE TABLE IF NOT EXISTS gad_content_edge_mappings (
      content_edge_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
      child_content_hash TEXT NOT NULL,
      coordinate_kind TEXT NOT NULL CHECK (coordinate_kind IN ('utf16', 'byte')),
      child_start INTEGER NOT NULL CHECK (child_start >= 0),
      child_end INTEGER NOT NULL CHECK (child_end >= child_start),
      parent_content_hash TEXT NOT NULL,
      parent_start INTEGER NOT NULL CHECK (parent_start >= 0),
      parent_end INTEGER NOT NULL CHECK (parent_end >= parent_start),
      digest TEXT NOT NULL,
      PRIMARY KEY (content_edge_id, ordinal)
    );
    CREATE INDEX IF NOT EXISTS idx_gad_content_edge_mappings_parent
      ON gad_content_edge_mappings(
        parent_content_hash, parent_start, parent_end, content_edge_id
      );

    -- A merge mutation owns one decision. Coordinate entries are the durable
    -- state-anchored accounting ledger; source changes remain normalized edges.
    CREATE TABLE IF NOT EXISTS gad_integration_decisions (
      decision_id TEXT PRIMARY KEY,
      target_state_kind TEXT NOT NULL CHECK (target_state_kind IN ('event', 'application')),
      target_state_id TEXT NOT NULL,
      source_event_id TEXT,
      source_delta_id TEXT,
      work_unit_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (work_unit_id),
      CHECK ((source_event_id IS NULL) <> (source_delta_id IS NULL))
    );
    CREATE INDEX IF NOT EXISTS idx_gad_decisions_source
      ON gad_integration_decisions(source_event_id, decision_id);
    CREATE INDEX IF NOT EXISTS idx_gad_decisions_delta
      ON gad_integration_decisions(source_delta_id, decision_id);
    CREATE INDEX IF NOT EXISTS idx_gad_decisions_target
      ON gad_integration_decisions(target_state_kind, target_state_id, decision_id);

    CREATE TABLE IF NOT EXISTS gad_merge_decision_entries (
      decision_id TEXT NOT NULL,
      coordinate_kind TEXT NOT NULL CHECK (coordinate_kind IN ('file', 'repository')),
      coordinate_id TEXT NOT NULL,
      resolution TEXT NOT NULL CHECK (
        resolution IN ('adopt', 'convergent', 'composed', 'ours', 'current')
      ),
      result_change_id TEXT,
      rationale TEXT,
      PRIMARY KEY (decision_id, coordinate_kind, coordinate_id)
    );
    CREATE INDEX IF NOT EXISTS idx_gad_merge_entries_coordinate
      ON gad_merge_decision_entries(coordinate_kind, coordinate_id, decision_id);

    CREATE TABLE IF NOT EXISTS gad_decision_source_changes (
      decision_id TEXT NOT NULL,
      coordinate_kind TEXT NOT NULL CHECK (coordinate_kind IN ('file', 'repository')),
      coordinate_id TEXT NOT NULL,
      change_id TEXT NOT NULL,
      PRIMARY KEY (decision_id, coordinate_kind, coordinate_id, change_id)
    );
    CREATE INDEX IF NOT EXISTS idx_gad_decision_source_changes_change
      ON gad_decision_source_changes(change_id, decision_id);

    CREATE TABLE IF NOT EXISTS gad_workspace_event_external_sources (
      event_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
      delta_id TEXT NOT NULL,
      PRIMARY KEY (event_id, ordinal),
      UNIQUE (event_id, delta_id)
    );
  `);
}
