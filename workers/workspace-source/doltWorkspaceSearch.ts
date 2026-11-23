import { compareUtf16CodeUnits } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import type { VcsSearchInput, VcsSearchHit } from "@vibestudio/service-schemas/vcs";
import { HISTORY_SEARCH_CAUSE_LIMIT, type HistorySearchCause } from "@vibestudio/service-schemas/workspaceSource";
import { readHistoryWorkUnitIntent } from "./doltMergeReview.js";
import { PROV_RESOLVER_PROTOCOL } from "./provenanceViews.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";

type SearchMatch = { hit: VcsSearchHit; createdAt: string };
type SearchRow = Record<string, unknown>;

function searchTerms(text: string): string[] {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).slice(0, 8) : [text];
}

/** The peer and its canonical origin are searched at immutable admitted revisions. */
export function searchHistoryProse(
  sql: SqlStorage,
  revisions: readonly string[],
  input: Pick<VcsSearchInput, "text" | "limit">,
) {
  const terms = searchTerms(input.text);
  const results = new Map<string, SearchMatch>();
  for (const revision of new Set(revisions)) {
    // A page can contain many older rows whose intent predates the resolved
    // columns. Resolve only those rows, and keep the amount read in one SQL
    // step bounded. The SQL predicates handle the ordinary stored-intent case.
    const pageSize = 128;
    const enough = input.limit + 1;
    let last: SearchRow | null = null;
    let accepted = 0;
    while (accepted < enough) {
      const rows = sql.exec(
        `WITH work AS (
           SELECT work_unit_id, created_at, trigger_excerpt,
                  CASE WHEN resolver_protocol = ?2 THEN resolved_intent_text END AS exact_intent
             FROM dolt_at_gad_work_units(?1)
         ), prose(subject_kind, subject_id, created_at, label, text, intent_id, trigger_text) AS (
           SELECT 'work-unit', work_unit_id, created_at, 'work unit',
                  exact_intent, work_unit_id, trigger_excerpt FROM work
           UNION ALL
           SELECT 'event', event_id, created_at, 'commit', message, NULL, NULL
             FROM dolt_at_events(?1) WHERE message IS NOT NULL
           UNION ALL
           SELECT 'decision', d.decision_id, d.created_at, 'integration decision',
                  (SELECT group_concat(entry.rationale, char(10) ORDER BY entry.coordinate_kind, entry.coordinate_id)
                     FROM dolt_at_gad_merge_decision_entries(?1) AS entry
                    WHERE entry.decision_id = d.decision_id),
                  NULL, NULL
             FROM dolt_at_gad_integration_decisions(?1) AS d
           UNION ALL
           SELECT 'external-delta', delta_id, delta.created_at, 'external delta · ' || delta.repo_path,
                  work.exact_intent, work.work_unit_id, NULL
             FROM dolt_at_gad_external_deltas(?1) AS delta JOIN work USING (work_unit_id)
         )
         SELECT * FROM prose
          WHERE (?4 IS NULL OR created_at < ?4
            OR (created_at = ?4 AND (subject_kind, subject_id) > (?5, ?6)))
            AND ((text IS NULL AND intent_id IS NOT NULL) OR NOT EXISTS (
              SELECT 1 FROM json_each(?3) AS term
               WHERE instr(lower(coalesce(text, '') || char(10) || coalesce(trigger_text, '')), lower(term.value)) = 0
            ))
          ORDER BY created_at DESC, subject_kind, subject_id LIMIT ?7`,
        revision, PROV_RESOLVER_PROTOCOL, JSON.stringify(terms),
        (last?.["created_at"] ?? null) as string | null,
        (last?.["subject_kind"] ?? null) as string | null,
        (last?.["subject_id"] ?? null) as string | null, pageSize,
      ).toArray();
      if (rows.length === 0) break;
      for (const row of rows) {
        const match = decodeMatch(sql, revision, row, terms);
        if (!match) continue;
        const { hit } = match;
        const id = String(row["subject_id"]);
        const key = `${hit.subjectKind}:${id}`;
        if (!results.has(key)) results.set(key, match);
        accepted++;
        if (accepted >= enough) break;
      }
      if (rows.length < pageSize) break;
      last = rows.at(-1)!;
    }
  }
  const all = [...results.values()].sort((left, right) =>
    compareUtf16CodeUnits(right.createdAt, left.createdAt) ||
    compareUtf16CodeUnits(left.hit.subjectKind, right.hit.subjectKind) ||
    compareUtf16CodeUnits(JSON.stringify(left.hit.node), JSON.stringify(right.hit.node)),
  );
  return { hits: all.slice(0, input.limit).map(({ hit }) => hit), truncated: all.length > input.limit };
}

function decodeMatch(
  sql: SqlStorage,
  revision: string,
  row: SearchRow,
  terms: readonly string[],
): SearchMatch | null {
  const kind = row["subject_kind"], id = row["subject_id"], createdAt = row["created_at"];
  if (typeof id !== "string" || typeof createdAt !== "string")
    throw new SemanticVcsError("IntegrityFailure", "Native search returned an invalid record");
  const node = kind === "work-unit" ? { kind, workUnitId: id } as const
    : kind === "event" ? { kind, eventId: id } as const
    : kind === "decision" ? { kind, decisionId: id } as const
    : kind === "external-delta" ? { kind, deltaId: id } as const : null;
  if (!node) throw new SemanticVcsError("IntegrityFailure", "Native search returned an invalid subject");
  const intentId = row["intent_id"];
  const text = row["text"];
  const intent = typeof intentId === "string" && (node.kind === "work-unit" || typeof text !== "string")
    ? readHistoryWorkUnitIntent(sql, revision, intentId) : undefined;
  const triggerText = row["trigger_text"];
  const prose = [
    typeof text === "string" ? text : intent?.text,
    typeof triggerText === "string" ? triggerText : null,
  ].filter((value) => value?.trim()).join("\n");
  if (!prose || (typeof text !== "string" &&
      !terms.every((term) => prose.toLowerCase().includes(term.toLowerCase())))) {
    return null;
  }
  const label = String(row["label"]).slice(0, 400);
  return {
    createdAt,
    hit: {
      node, subjectKind: node.kind, label, excerpt: prose.trim().slice(0, 400),
      ...(node.kind === "work-unit" && intent ? { intent } : {}),
    },
  };
}

/** Causal evidence can enter the mirror only from an admitted native revision. */
export function historySearchCausesAt(
  sql: SqlStorage, revision: string, after: HistorySearchCause | null,
): HistorySearchCause[] {
  return sql.exec(
    `SELECT DISTINCT cause_log_id, cause_head, cause_invocation_id
       FROM dolt_at_commands(?1)
      WHERE cause_log_id IS NOT NULL AND cause_head IS NOT NULL AND cause_invocation_id IS NOT NULL
        AND (?2 IS NULL OR (cause_log_id, cause_head, cause_invocation_id) > (?2, ?3, ?4))
      ORDER BY cause_log_id, cause_head, cause_invocation_id
      LIMIT ?5`,
    revision, after?.[0] ?? null, after?.[1] ?? null, after?.[2] ?? null, HISTORY_SEARCH_CAUSE_LIMIT,
  ).toArray().map(({ cause_log_id, cause_head, cause_invocation_id }): HistorySearchCause => {
    if (typeof cause_log_id !== "string" || typeof cause_head !== "string" || typeof cause_invocation_id !== "string")
      throw new SemanticVcsError("IntegrityFailure", "Workspace search returned an invalid causal origin");
    return [cause_log_id, cause_head, cause_invocation_id];
  });
}

/** Match indexed messages visible through these exact native command causes. */
export function searchTrajectoryProse(
  sql: SqlStorage,
  input: Pick<VcsSearchInput, "text" | "limit">,
  causes: readonly HistorySearchCause[],
): VcsSearchHit[] {
  if (causes.length === 0) return [];
  const terms = searchTerms(input.text);
  return sql.exec(
    `WITH admitted AS (
       SELECT i.log_id, i.head, i.turn_id, links.input_log_id, links.input_head, links.input_message_id
         FROM json_each(?1) AS causes
         JOIN trajectory_invocations i
           ON i.log_id = causes.value ->> 0 AND i.head = causes.value ->> 1
          AND i.invocation_id = causes.value ->> 2
         LEFT JOIN trajectory_invocation_inputs links
           ON links.log_id = i.log_id AND links.head = i.head AND links.invocation_id = i.invocation_id
     ), messages AS (
       SELECT m.log_id, m.head, m.message_id
         FROM admitted a JOIN trajectory_messages m
           ON m.log_id = a.log_id AND m.head = a.head AND m.turn_id = a.turn_id
       UNION
       SELECT input_log_id, input_head, input_message_id FROM admitted WHERE input_message_id IS NOT NULL
     ), prose AS (
       SELECT message.log_id, message.head, message.message_id, message.role,
              (SELECT group_concat(content, char(10)) FROM (
                 SELECT block.value ->> '$.content' AS content
                   FROM json_each(event.payload_ref_json, '$.blocks') AS block
                  WHERE block.value ->> '$.type' = 'text'
                    AND json_type(block.value, '$.content') = 'text'
                  ORDER BY block.key
               )) AS text
         FROM messages admitted
         JOIN trajectory_messages message USING (log_id, head, message_id)
         JOIN log_events event
           ON event.log_id = message.log_id AND event.head = message.head
          AND event.envelope_id = COALESCE(message.completed_event_id, message.started_event_id)
     )
     SELECT log_id, head, message_id AS subject_id, 'message · ' || role AS label,
            substr(text, 1, 400) AS excerpt
       FROM prose
      WHERE text IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM json_each(?2) AS term WHERE instr(lower(text), lower(term.value)) = 0
      )
      ORDER BY log_id, head, message_id LIMIT ?3`,
    JSON.stringify(causes), JSON.stringify(terms), input.limit + 1,
  ).toArray().map(({ log_id, head, subject_id, label, excerpt }): VcsSearchHit => {
    if (typeof log_id !== "string" || typeof head !== "string" || typeof subject_id !== "string")
      throw new SemanticVcsError("IntegrityFailure", "Workspace search returned an invalid message");
    return {
      node: { kind: "trajectory-message", logId: log_id, head, messageId: subject_id },
      subjectKind: "trajectory-message",
      label: typeof label === "string" && label ? label.slice(0, 400) : "trajectory message",
      excerpt: typeof excerpt === "string" && excerpt ? excerpt : "trajectory message",
    };
  });
}
