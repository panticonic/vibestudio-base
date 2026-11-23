import {
  canonicalJson,
  compareUtf16CodeUnits,
} from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import { workspacePlacementRoots } from "./doltWorkspaceState.js";
import { execBatchedInsert } from "./sqlBatch.js";

export function createWorkspaceContentRootIndex(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS content_roots (
    content_hash TEXT PRIMARY KEY
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS content_root_basis (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    tips_json TEXT NOT NULL,
    root_count INTEGER NOT NULL CHECK (root_count >= 0)
  )`);
}

function readRoots(sql: SqlStorage): string[] {
  return sql
    .exec("SELECT content_hash FROM content_roots ORDER BY content_hash")
    .toArray()
    .map(({ content_hash }) => {
      if (
        typeof content_hash !== "string" ||
        !/^[a-f0-9]{64}$/u.test(content_hash)
      ) {
        throw new Error(
          "Workspace content-root index contains an invalid digest",
        );
      }
      return content_hash;
    });
}

/** Use diffs when the old and new tips prove complete coverage of each other. */
function addedPlacementRoots(
  sql: SqlStorage,
  before: readonly string[],
  after: readonly string[],
): string[] | null {
  const previous = new Set(before);
  const covered = new Set(after.filter((tip) => previous.has(tip)));
  const added = new Set<string>();
  for (const tip of after) {
    if (previous.has(tip)) continue;
    const parents = sql
      .exec(
        `SELECT parent_hash FROM dolt_commit_ancestors
       WHERE commit_hash = ? AND parent_hash IS NOT NULL ORDER BY parent_index`,
        tip,
      )
      .toArray()
      .map(({ parent_hash }) => parent_hash);
    if (
      parents.length === 0 ||
      parents.some(
        (parent) => typeof parent !== "string" || !previous.has(parent),
      )
    )
      return null;
    for (const parent of parents as string[]) covered.add(parent);
    const rows = sql
      .exec(
        `SELECT DISTINCT to_content_hash AS content_hash FROM dolt_diff_files(?, ?)
        WHERE to_content_hash IS NOT NULL`,
        parents[0],
        tip,
      )
      .toArray();
    for (const { content_hash } of rows) {
      if (
        typeof content_hash !== "string" ||
        !/^[a-f0-9]{64}$/u.test(content_hash)
      )
        throw new Error(
          "Invalid workspace content identity in the commit diff",
        );
      added.add(content_hash);
    }
  }
  return covered.size === previous.size ? [...added] : null;
}

/** The index answers retention only. Native revision queries still decide file access. */
export function indexedWorkspacePlacementRoots(
  sql: SqlStorage,
  retained: readonly string[],
  transaction: (write: () => string[]) => string[],
): string[] {
  const heads = [...new Set(retained)].sort(compareUtf16CodeUnits);
  const basis = canonicalJson(heads);
  const marker = sql
    .exec("SELECT tips_json, root_count FROM content_root_basis WHERE id = 1")
    .toArray()[0];
  const cached = marker ? readRoots(sql) : [];
  const complete = marker?.["root_count"] === cached.length;
  if (complete && marker?.["tips_json"] === basis) return cached;
  const before =
    complete && typeof marker?.["tips_json"] === "string"
      ? (JSON.parse(marker["tips_json"]) as unknown)
      : null;
  const added =
    Array.isArray(before) &&
    before.length > 0 &&
    before.every((tip): tip is string => typeof tip === "string")
      ? addedPlacementRoots(sql, before, heads)
      : null;

  return transaction(() => {
    const roots = added ?? workspacePlacementRoots(sql, heads);
    if (added === null) sql.exec("DELETE FROM content_roots");
    execBatchedInsert(
      sql,
      "INSERT OR IGNORE INTO content_roots (content_hash)",
      1,
      roots.map((hash) => [hash]),
    );
    const indexed = readRoots(sql);
    sql.exec(
      `INSERT INTO content_root_basis (id, tips_json, root_count) VALUES (1, ?, ?)
        ON CONFLICT (id) DO UPDATE SET tips_json = excluded.tips_json, root_count = excluded.root_count`,
      basis,
      indexed.length,
    );
    return indexed;
  });
}
