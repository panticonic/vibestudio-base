import { DEFAULT_LOCAL_PREFIX } from "@panticonic/pi-durable/storage/sqlite";

/** The SQL surface of a native storage; the split runs inside the caller's transaction. */
export interface PiStoreSql {
  exec(
    sql: string,
    ...values: (null | string | number | ArrayBuffer)[]
  ): { toArray(): Record<string, unknown>[] };
}

/** The key of the owner's `state` row that records which layout the Pi tables have. */
export const PI_STORE_LAYOUT_KEY = "vibestudio.pi-store.layout";
/** 2: one table set, as Pi ships it. 3: the versioned set and the local `vsl_` set (`CompositeSqliteStorage`). */
export const PI_STORE_LAYOUT_VERSION = 3;

/**
 * A document is local unless it is conversation knowledge: a conversation document that a fork inherits (`fork` of
 * `current` or `asOf`). This is `defaultDocumentRoute` as SQL over the legacy tables, whose record JSON (revision 0 of
 * the payload) carries the fork behavior.
 */
const LOCAL_DOCUMENT_IDS = `
  SELECT d.id FROM documents d
  LEFT JOIN payload_chunks p ON p.id = d.id AND p.revision = 0 AND p.ordinal = 0
  WHERE d.scope_kind <> 'conversation'
     OR p.id IS NULL
     OR COALESCE(json_extract(CAST(p.data AS TEXT), '$.fork'), 'initial') = 'initial'`;

/**
 * Whether a store still has Pi's single-set layout: its tasks, submissions or non-knowledge documents are in the
 * default-named tables that the composite store keeps conversation knowledge in.
 */
export function hasLegacyPiLayout(sql: PiStoreSql): boolean {
  for (const table of ["tasks", "submissions"] as const)
    if (sql.exec(`SELECT 1 AS found FROM ${table} LIMIT 1`).toArray().length > 0) return true;
  return sql.exec(`SELECT 1 AS found FROM (${LOCAL_DOCUMENT_IDS}) LIMIT 1`).toArray().length > 0;
}

/**
 * Move a store made with Pi's single table set into the composite layout, in the caller's transaction: tasks,
 * submissions and the documents that are not conversation knowledge (with their revisions, payload chunks and ID rows)
 * go to the local set, and the local counters take the legacy ones. Conversations, entries and conversation documents
 * stay. Every row keeps its ID, so no reference changes.
 */
export function splitLegacyPiStore(sql: PiStoreSql, prefix: string = DEFAULT_LOCAL_PREFIX): void {
  const run = (statement: string, ...values: (null | string | number | ArrayBuffer)[]): void => {
    sql.exec(statement, ...values).toArray();
  };
  // The ids to move are decided once, before any row moves: the document rule reads the legacy payload chunks. The
  // scratch table is in the local set (`vsl_` is local on a Dolt cell) and is gone before the transaction ends.
  const ids = `${prefix}split_ids`;
  run(`DROP TABLE IF EXISTS ${ids}`);
  run(`CREATE TABLE ${ids} (id INTEGER PRIMARY KEY)`);
  run(`INSERT OR IGNORE INTO ${ids} SELECT id FROM tasks`);
  run(`INSERT OR IGNORE INTO ${ids} SELECT id FROM submissions`);
  run(`INSERT OR IGNORE INTO ${ids} ${LOCAL_DOCUMENT_IDS}`);
  const moves: ReadonlyArray<readonly [string, string]> = [
    ["record_ids", `id IN (SELECT id FROM ${ids})`],
    ["tasks", "1 = 1"],
    ["submissions", "1 = 1"],
    ["documents", `id IN (SELECT id FROM ${ids})`],
    ["document_revisions", `document_id IN (SELECT id FROM ${ids})`],
    ["payload_chunks", `id IN (SELECT id FROM ${ids})`],
  ];
  for (const [table, where] of moves) {
    run(`INSERT OR REPLACE INTO ${prefix}${table} SELECT * FROM ${table} WHERE ${where}`);
    run(`DELETE FROM ${table} WHERE ${where}`);
  }
  run(`DROP TABLE ${ids}`);
  run(
    `UPDATE ${prefix}durable_metadata SET
       next_id = (SELECT next_id FROM durable_metadata WHERE singleton = 1),
       next_seq = (SELECT next_seq FROM durable_metadata WHERE singleton = 1)
     WHERE singleton = 1`,
  );
}
